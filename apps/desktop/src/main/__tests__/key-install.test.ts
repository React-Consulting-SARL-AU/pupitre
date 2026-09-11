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

describe("la ligne posée sur le serveur", () => {
  it("n'ajoute la clé que si elle n'y est pas déjà", () => {
    const script = authorizeScript(PUBLIC_KEY);

    expect(script).toContain(`grep -qxF '${PUBLIC_KEY}'`);
    expect(script).toContain('>> "$HOME/.ssh/authorized_keys"');
  });

  it("ferme le dossier et le fichier avant d'écrire dedans", () => {
    const script = authorizeScript(PUBLIC_KEY);

    expect(script).toContain("umask 077");
    expect(script).toContain('chmod 700 "$HOME/.ssh"');
    expect(script).toContain('chmod 600 "$HOME/.ssh/authorized_keys"');
  });

  it("ne colle pas sa clé au bout d'une ligne sans retour à la ligne", () => {
    expect(authorizeScript(PUBLIC_KEY)).toContain('tail -c 1 "$HOME/.ssh');
  });

  it("refuse tout ce qui n'est pas une ligne de clé publique", () => {
    expect(() => authorizeScript("ssh-ed25519 AAA'; rm -rf /")).toThrow();
    expect(() => authorizeScript("pas une clé")).toThrow();
  });
});

describe("la lecture d'un refus de ssh", () => {
  it("distingue une machine qui veut un mot de passe d'une qui n'en veut pas", () => {
    expect(rebuffOf("Permission denied (publickey,password).")).toBe(
      "password"
    );
    expect(rebuffOf("Permission denied (publickey).")).toBe("no-password");
  });

  it("reconnaît une empreinte qui a changé et une adresse muette", () => {
    expect(rebuffOf("Host key verification failed.")).toBe("host-key");
    expect(rebuffOf("ssh: connect to host: Connection refused")).toBe(
      "unreachable"
    );
  });
});

describe("l'installation de la clé", () => {
  it("n'écrit rien quand la machine s'ouvre déjà", async () => {
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

  it("pose la clé avec ce que l'ordinateur détient déjà, puis la vérifie", async () => {
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

  it("ne frappe pas d'abord avec une clé qui vient d'être faite", async () => {
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

  it("demande le mot de passe quand la machine en offre un", async () => {
    const { answer } = install([
      { code: 255, stderr: "Permission denied (publickey,password)." },
      { code: 255, stderr: "Permission denied (publickey,password)." },
    ]);

    expect(await answer).toEqual({
      ok: true,
      result: { retry: false, status: "password" },
    });
  });

  it("redemande le mot de passe quand celui qu'on a donné est refusé", async () => {
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

  it("ne met jamais le mot de passe sur la ligne de commande", async () => {
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

  it("rend la main quand le serveur n'accepte que des clés", async () => {
    const { answer } = install([
      { code: 255, stderr: "Permission denied (publickey)." },
      { code: 255, stderr: "Permission denied (publickey)." },
    ]);

    expect(await answer).toMatchObject({
      ok: true,
      result: { status: "manual" },
    });
  });

  it("refuse de croire une clé posée que la machine n'accepte pas", async () => {
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

  it("n'installe rien sur un hôte qui vient de la configuration du système", async () => {
    const { spawn } = recorder([]);

    const answer = await installKey({
      paths: PATHS,
      publicKey: PUBLIC_KEY,
      server: { ...SERVER, origin: "system" },
      spawn,
    });

    expect(answer).toMatchObject({ ok: false });
  });

  it("rend la ligne à coller plutôt qu'un mot de passe sous Windows", async () => {
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

describe("les arguments de chaque tentative", () => {
  it("ne réutilise jamais une session déjà ouverte, ni n'en laisse une", () => {
    for (const args of [
      opensArgs(SERVER, PATHS),
      offeredArgs(SERVER, PATHS),
      passwordArgs(SERVER, PATHS),
    ]) {
      expect(args).toContain("ControlPath=none");
      expect(args).toContain("ControlMaster=no");
    }
  });

  it("n'ouvre la machine qu'avec la clé de l'app, sans jamais demander", () => {
    const args = opensArgs(SERVER, PATHS);

    expect(args).toContain("BatchMode=yes");
    expect(args).toContain(PATHS.configPath);
    expect(args.at(-1)).toBe("true");
  });

  it("laisse l'agent et ~/.ssh tenter avant qu'on demande un mot de passe", () => {
    const args = offeredArgs(SERVER, PATHS, ["/home/moi/.ssh/id_ed25519"]);

    expect(args).toContain("IdentitiesOnly=no");
    expect(args).toContain("BatchMode=yes");
    expect(args.join(" ")).toContain("-i /home/moi/.ssh/id_ed25519");
  });

  it("nomme les clés de ~/.ssh que ssh n'offrirait plus de lui-même", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));

    mkdirSync(join(home, ".ssh"));
    writeFileSync(join(home, ".ssh", "id_ed25519"), "");

    expect(ownIdentities(home)).toEqual([join(home, ".ssh", "id_ed25519")]);
  });

  it("n'offre que le mot de passe quand c'est lui qu'on essaie", () => {
    const args = passwordArgs(SERVER, PATHS);

    expect(args).toContain("PubkeyAuthentication=no");
    expect(args).toContain("NumberOfPasswordPrompts=1");
    expect(args).toContain(
      "PreferredAuthentications=password,keyboard-interactive"
    );
  });
});

describe("l'aide qui répond à ssh", () => {
  it("ne contient aucun mot de passe et n'est lisible que par nous", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "pupitre-askpass-")), "ssh");

    const file = writeAskpass(dir);

    expect(readFileSync(file, "utf8")).toContain("$PUPITRE_ASKPASS");
    expect(statSync(file).mode & 0o777).toBe(0o700);
  });

  it("n'existe pas là où ssh ne sait pas s'en servir", () => {
    expect(installsWithPassword("win32")).toBe(false);
    expect(installsWithPassword("darwin")).toBe(true);
    expect(installsWithPassword("linux")).toBe(true);
  });
});
