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

describe("la frappe sur un compte", () => {
  it("offre ce que l'ordinateur détient et la clé à importer, sans en écrire aucune", () => {
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

  it("épingle la clé d'hôte dans le known_hosts de l'app, comme le premier contact", () => {
    const args = knockArgs(TARGET, PATHS, []);

    expect(args).toContain(`UserKnownHostsFile=${PATHS.knownHostsPath}`);
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).toContain("ControlMaster=no");
  });

  /**
   * The file to import is a path the renderer carries: it is offered to `ssh`
   * only when the file picker handed it out, and a path named any other way
   * is knocked without.
   */
  it("n'offre à ssh qu'une clé que le sélecteur a désignée", async () => {
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

  it("dit que le compte s'ouvre déjà quand ssh entre", async () => {
    const { spawn } = recorder([{ code: 0 }]);

    expect(await probeAccess(TARGET, PATHS, { identities: [], spawn })).toEqual(
      { access: "opens" }
    );
  });

  it("dit qu'un mot de passe ouvrirait la porte quand la machine en offre un", async () => {
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

  it("annonce la ligne à coller quand la machine n'accepte que des clés", async () => {
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

  it("laisse tomber une épingle que plus aucun serveur ne possède, et frappe encore", async () => {
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

  it("garde le refus d'une empreinte qu'un serveur de la liste a épinglée", async () => {
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

  it("ne demande pas un mot de passe que Windows ne saurait donner", async () => {
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

describe("la frappe sur une adresse puis un compte", () => {
  it("refuse une adresse ou un compte qui ne peuvent pas devenir un argument de ssh", async () => {
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

  it("ne frappe pas sur un compte quand l'adresse ne répond pas", async () => {
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

  it("joint ce qui ouvre le compte à la réponse de l'adresse", async () => {
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
