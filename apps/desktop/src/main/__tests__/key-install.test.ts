import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeyInstallPhase, Server } from "@shared/servers";
import {
  authorizeScript,
  installKey,
  installsWithPassword,
  offeredArgs,
  opensArgs,
  ownIdentities,
  passwordArgs,
  rebuffOf,
  writeAskpass,
} from "../key-install";
import { appSshPaths } from "../ssh-config";
import { type Answer, recorder } from "./ssh-recorder";

const SERVER: Server = {
  host: "203.0.113.10",
  id: "srv-a",
  keyPath: "/keys/srv-a",
  name: "Atelier",
  origin: "app",
  port: 2222,
  user: "root",
};

const PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample pupitre srv-a";

const PATHS = appSshPaths(mkdtempSync(join(tmpdir(), "pupitre-install-")));

function install(
  answers: Answer[],
  options: { password?: string; phases?: KeyInstallPhase[] } = {}
) {
  const { calls, spawn } = recorder(answers);

  return {
    calls,
    answer: installKey({
      onPhase: (phase) => options.phases?.push(phase),
      password: options.password ?? null,
      paths: PATHS,
      platform: "darwin",
      publicKey: PUBLIC_KEY,
      server: SERVER,
      spawn,
    }),
  };
}

describe("the line placed on the server", () => {
  it("only adds the key if it is not already there", () => {
    const script = authorizeScript(PUBLIC_KEY);

    expect(script).toContain(`grep -qxF '${PUBLIC_KEY}'`);
    expect(script).toContain('>> "$HOME/.ssh/authorized_keys"');
  });

  it("locks down the folder and the file before writing into them", () => {
    const script = authorizeScript(PUBLIC_KEY);

    expect(script).toContain("umask 077");
    expect(script).toContain('chmod 700 "$HOME/.ssh"');
    expect(script).toContain('chmod 600 "$HOME/.ssh/authorized_keys"');
  });

  it("does not glue its key onto a line with no trailing newline", () => {
    expect(authorizeScript(PUBLIC_KEY)).toContain('tail -c 1 "$HOME/.ssh');
  });

  it("refuses anything that is not a public key line", () => {
    expect(() => authorizeScript("ssh-ed25519 AAA'; rm -rf /")).toThrow();
    expect(() => authorizeScript("pas une clé")).toThrow();
  });
});

describe("reading an ssh refusal", () => {
  it("tells a machine that wants a password from one that does not", () => {
    expect(rebuffOf("Permission denied (publickey,password).")).toBe(
      "password"
    );
    expect(rebuffOf("Permission denied (publickey).")).toBe("no-password");
  });

  it("recognises a changed fingerprint and a silent address", () => {
    expect(rebuffOf("Host key verification failed.")).toBe("host-key");
    expect(rebuffOf("ssh: connect to host: Connection refused")).toBe(
      "unreachable"
    );
  });
});

describe("installing the key", () => {
  it("writes nothing when the machine already opens", async () => {
    const phases: KeyInstallPhase[] = [];
    const { answer, calls } = install([{ code: 0 }], { phases });

    expect(await answer).toEqual({
      ok: true,
      result: { installed: false, status: "opened" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].args.at(-1)).toBe("true");
    expect(phases).toEqual(["reaching"]);
  });

  it("places the key with what the computer already holds, then verifies it", async () => {
    const phases: KeyInstallPhase[] = [];
    const { answer, calls } = install(
      [
        { code: 255, stderr: "Permission denied (publickey,password)." },
        { code: 0 },
        { code: 0 },
      ],
      { phases }
    );

    expect(await answer).toEqual({
      ok: true,
      result: { installed: true, status: "opened" },
    });
    expect(calls[1].stdin).toContain(PUBLIC_KEY);
    expect(calls[1].args).toContain("IdentitiesOnly=no");
    expect(calls[2].args.at(-1)).toBe("true");
    expect(phases).toEqual(["reaching", "authorizing", "verifying"]);
  });

  it("does not knock first with a key that was just created", async () => {
    const phases: KeyInstallPhase[] = [];
    const { calls, spawn } = recorder([{ code: 0 }, { code: 0 }]);

    const answer = await installKey({
      freshKey: true,
      onPhase: (phase) => phases.push(phase),
      password: "hunter2",
      paths: PATHS,
      platform: "darwin",
      publicKey: PUBLIC_KEY,
      server: SERVER,
      spawn,
    });

    expect(answer).toEqual({
      ok: true,
      result: { installed: true, status: "opened" },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].args).toContain("PubkeyAuthentication=no");
    expect(phases).toEqual(["authorizing", "verifying"]);
  });

  it("asks for the password when the machine offers one", async () => {
    const { answer } = install([
      { code: 255, stderr: "Permission denied (publickey,password)." },
      { code: 255, stderr: "Permission denied (publickey,password)." },
    ]);

    expect(await answer).toEqual({
      ok: true,
      result: { retry: false, status: "password" },
    });
  });

  it("asks for the password again when the one given is refused", async () => {
    const { answer } = install(
      [
        { code: 255, stderr: "Permission denied (publickey)." },
        { code: 255, stderr: "Permission denied, please try again." },
      ],
      { password: "hunter2" }
    );

    expect(await answer).toEqual({
      ok: true,
      result: { retry: true, status: "password" },
    });
  });

  it("never puts the password on the command line", async () => {
    const { answer, calls } = install(
      [
        { code: 255, stderr: "Permission denied (publickey,password)." },
        { code: 0 },
        { code: 0 },
      ],
      { password: "hunter2" }
    );

    await answer;

    for (const call of calls) {
      expect(call.args.join(" ")).not.toContain("hunter2");
      expect(call.stdin).not.toContain("hunter2");
    }

    expect(calls[1].env?.PUPITRE_ASKPASS).toBe("hunter2");
    expect(calls[1].env?.SSH_ASKPASS_REQUIRE).toBe("force");
    expect(calls[1].args).toContain("PubkeyAuthentication=no");
  });

  it("hands control back when the server only accepts keys", async () => {
    const { answer } = install([
      { code: 255, stderr: "Permission denied (publickey)." },
      { code: 255, stderr: "Permission denied (publickey)." },
    ]);

    expect(await answer).toMatchObject({
      ok: true,
      result: { status: "manual" },
    });
  });

  it("refuses to believe in a placed key the machine does not accept", async () => {
    const { answer } = install([
      { code: 255, stderr: "Permission denied (publickey,password)." },
      { code: 0 },
      { code: 255, stderr: "Permission denied (publickey)." },
    ]);

    expect(await answer).toMatchObject({
      ok: true,
      result: { status: "manual" },
    });
  });

  it("installs nothing on a host that comes from the system configuration", async () => {
    const { spawn } = recorder([]);

    const answer = await installKey({
      paths: PATHS,
      publicKey: PUBLIC_KEY,
      server: { ...SERVER, origin: "system" },
      spawn,
    });

    expect(answer).toMatchObject({ ok: false });
  });

  it("returns the line to paste instead of a password on Windows", async () => {
    const { spawn } = recorder([]);

    const answer = await installKey({
      password: "hunter2",
      paths: PATHS,
      platform: "win32",
      publicKey: PUBLIC_KEY,
      server: SERVER,
      spawn,
    });

    expect(answer).toEqual({
      ok: true,
      result: {
        status: "manual",
        phrase: { id: "refusal.keyInstall.windows" },
      },
    });
  });
});

describe("the arguments of each attempt", () => {
  it("never reuses an already open session, nor leaves one behind", () => {
    for (const args of [
      opensArgs(SERVER, PATHS),
      offeredArgs(SERVER, PATHS),
      passwordArgs(SERVER, PATHS),
    ]) {
      expect(args).toContain("ControlPath=none");
      expect(args).toContain("ControlMaster=no");
    }
  });

  it("only opens the machine with the app's key, never asking", () => {
    const args = opensArgs(SERVER, PATHS);

    expect(args).toContain("BatchMode=yes");
    expect(args).toContain(PATHS.configPath);
    expect(args.at(-1)).toBe("true");
  });

  it("lets the agent and ~/.ssh try before a password is asked", () => {
    const args = offeredArgs(SERVER, PATHS, ["/home/moi/.ssh/id_ed25519"]);

    expect(args).toContain("IdentitiesOnly=no");
    expect(args).toContain("BatchMode=yes");
    expect(args.join(" ")).toContain("-i /home/moi/.ssh/id_ed25519");
  });

  it("names the ~/.ssh keys that ssh would no longer offer on its own", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));

    mkdirSync(join(home, ".ssh"));
    writeFileSync(join(home, ".ssh", "id_ed25519"), "");

    expect(ownIdentities(home)).toEqual([join(home, ".ssh", "id_ed25519")]);
  });

  it("only offers the password when it is the one being tried", () => {
    const args = passwordArgs(SERVER, PATHS);

    expect(args).toContain("PubkeyAuthentication=no");
    expect(args).toContain("NumberOfPasswordPrompts=1");
    expect(args).toContain(
      "PreferredAuthentications=password,keyboard-interactive"
    );
  });
});

describe("the helper that answers ssh", () => {
  it("contains no password and is readable only by us", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "pupitre-askpass-")), "ssh");

    const file = writeAskpass(dir);

    expect(readFileSync(file, "utf8")).toContain("$PUPITRE_ASKPASS");
    expect(statSync(file).mode & 0o777).toBe(0o700);
  });

  it("does not exist where ssh cannot use it", () => {
    expect(installsWithPassword("win32")).toBe(false);
    expect(installsWithPassword("darwin")).toBe(true);
    expect(installsWithPassword("linux")).toBe(true);
  });
});
