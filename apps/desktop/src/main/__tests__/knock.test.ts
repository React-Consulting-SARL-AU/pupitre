import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressReach, ServerKnock } from "@shared/servers";
import { designateKeyFile } from "../key-files";
import { knock, knockArgs, probeAccess } from "../knock";
import { appSshPaths } from "../ssh-config";
import { recorder } from "./ssh-recorder";

const PATHS = appSshPaths(mkdtempSync(join(tmpdir(), "pupitre-knock-")));

const TARGET: ServerKnock = {
  host: "203.0.113.10",
  keyFile: null,
  port: 2222,
  user: "root",
};

const ANSWERED: AddressReach = {
  ms: 12,
  reached: true,
  software: "OpenSSH_9.6",
};

describe("knocking on an account", () => {
  it("offers what the computer holds and the key to import, writing none", () => {
    const args = knockArgs({ ...TARGET, keyFile: "/home/j/.ssh/vps" }, PATHS, [
      "/home/j/.ssh/id_ed25519",
    ]);

    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("IdentitiesOnly=no");
    expect(args.join(" ")).toContain("-i /home/j/.ssh/id_ed25519");
    expect(args.join(" ")).toContain("-i /home/j/.ssh/vps");
    expect(args.join(" ")).toContain("-p 2222 -l root");
    expect(args.at(-2)).toBe("203.0.113.10");
    expect(args.at(-1)).toBe("true");
  });

  it("pins the host key in the app's known_hosts, like the first contact", () => {
    const args = knockArgs(TARGET, PATHS, []);

    expect(args).toContain(`UserKnownHostsFile=${PATHS.knownHostsPath}`);
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).toContain("ControlMaster=no");
  });

  it("only offers ssh a key the picker designated", async () => {
    const invented = recorder([{ code: 0 }]);

    // The designated set is shared by every test file of the run: this path must be one no other test designates.
    await probeAccess({ ...TARGET, keyFile: "/home/j/.ssh/invented" }, PATHS, {
      identities: [],
      spawn: invented.spawn,
    });

    expect(invented.calls[0]?.args.join(" ")).not.toContain(
      "/home/j/.ssh/invented"
    );

    const picked = recorder([{ code: 0 }]);
    const file = designateKeyFile("/home/j/.ssh/picked") ?? "";

    await probeAccess({ ...TARGET, keyFile: file }, PATHS, {
      identities: [],
      spawn: picked.spawn,
    });

    expect(picked.calls[0]?.args.join(" ")).toContain("-i /home/j/.ssh/picked");
  });

  it("says the account already opens when ssh gets in", async () => {
    const { spawn } = recorder([{ code: 0 }]);

    expect(await probeAccess(TARGET, PATHS, { identities: [], spawn })).toEqual(
      { access: "opens" }
    );
  });

  it("says a password would open the door when the machine offers one", async () => {
    const { spawn } = recorder([
      { code: 255, stderr: "Permission denied (publickey,password)." },
    ]);

    expect(
      await probeAccess(TARGET, PATHS, {
        identities: [],
        platform: "darwin",
        spawn,
      })
    ).toEqual({ access: "password" });
  });

  it("announces the line to paste when the machine only accepts keys", async () => {
    const { spawn } = recorder([
      { code: 255, stderr: "Permission denied (publickey)." },
    ]);

    expect(await probeAccess(TARGET, PATHS, { identities: [], spawn })).toEqual(
      {
        access: "manual",
        phrase: {
          id: "refusal.keyInstall.keysOnly.detail",
          values: { detail: "Permission denied (publickey)." },
        },
      }
    );
  });

  it("drops a pin no server holds any more, and knocks again", async () => {
    const { calls, spawn } = recorder([
      { code: 255, stderr: "Host key verification failed." },
      { code: 255, stderr: "Permission denied (publickey,password)." },
    ]);
    let dropped = 0;

    expect(
      await probeAccess(TARGET, PATHS, {
        forgetStalePin: () => {
          dropped += 1;

          return Promise.resolve(true);
        },
        identities: [],
        platform: "darwin",
        spawn,
      })
    ).toEqual({ access: "password" });
    expect(dropped).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("keeps the refusal of a fingerprint that a server in the list pinned", async () => {
    const { calls, spawn } = recorder([
      { code: 255, stderr: "Host key verification failed." },
    ]);

    expect(
      await probeAccess(TARGET, PATHS, {
        forgetStalePin: () => Promise.resolve(false),
        identities: [],
        spawn,
      })
    ).toMatchObject({
      access: "manual",
      phrase: { id: "refusal.keyInstall.hostKey.detail" },
    });
    expect(calls).toHaveLength(1);
  });

  it("does not ask for a password that Windows could not supply", async () => {
    const { spawn } = recorder([
      { code: 255, stderr: "Permission denied (publickey,password)." },
    ]);

    expect(
      await probeAccess(TARGET, PATHS, {
        identities: [],
        platform: "win32",
        spawn,
      })
    ).toEqual({
      access: "manual",
      phrase: { id: "refusal.keyInstall.windows" },
    });
  });
});

describe("knocking on an address, then an account", () => {
  it("refuses an address or an account that cannot become an ssh argument", async () => {
    const { calls, spawn } = recorder([]);

    expect(
      await knock({ ...TARGET, host: "-oProxyCommand=x" }, PATHS, { spawn })
    ).toMatchObject({ code: "bad-host", reached: false });
    expect(
      await knock({ ...TARGET, user: "root; id" }, PATHS, { spawn })
    ).toMatchObject({
      code: "bad-user",
      phrase: { id: "refusal.setup.user" },
      reached: false,
    });
    expect(calls).toHaveLength(0);
  });

  it("does not knock on an account when the address does not respond", async () => {
    const { calls, spawn } = recorder([{ code: 0 }]);
    const silent: AddressReach = {
      code: "timeout",
      phrase: { id: "refusal.reach.timeout" },
      reached: false,
    };

    expect(
      await knock(TARGET, PATHS, {
        reach: () => Promise.resolve(silent),
        spawn,
      })
    ).toEqual(silent);
    expect(calls).toHaveLength(0);
  });

  it("joins what opens the account to the address's response", async () => {
    const { spawn } = recorder([
      { code: 255, stderr: "Permission denied (publickey,password)." },
    ]);

    expect(
      await knock(TARGET, PATHS, {
        identities: [],
        platform: "darwin",
        reach: () => Promise.resolve(ANSWERED),
        spawn,
      })
    ).toEqual({ ...ANSWERED, access: { access: "password" } });
  });
});
