import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  addServer,
  pinFingerprint,
  removeServer,
  SetupError,
  untrustHost,
} from "../server-setup";
import { appSshPaths, writeSshConfig } from "../ssh-config";

const SYSTEM_CONFIG = `Host dev-vps
  HostName 198.51.100.7
  User dev
  IdentityFile ~/.ssh/id_ed25519
`;

function hash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** A home of its own, with the ~/.ssh/config the app must never touch. */
function fakeHome(): { home: string; sshConfig: string } {
  const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
  const dir = join(home, ".ssh");
  mkdirSync(dir, { mode: 0o700, recursive: true });
  const sshConfig = join(dir, "config");
  writeFileSync(sshConfig, SYSTEM_CONFIG, { mode: 0o600 });

  return { home, sshConfig };
}

function userData(): string {
  return mkdtempSync(join(tmpdir(), "pupitre-userdata-"));
}

describe("le parcours d'ajout d'un serveur", () => {
  it("ne modifie jamais le ~/.ssh/config de l'utilisateur", async () => {
    const { sshConfig } = fakeHome();
    const paths = appSshPaths(userData());
    const before = hash(sshConfig);
    const userBefore = existsSync(join(homedir(), ".ssh", "config"))
      ? hash(join(homedir(), ".ssh", "config"))
      : null;

    const created = await addServer(
      {
        host: "203.0.113.10",
        key: { mode: "generate" },
        name: "Staging",
        port: 22,
        user: "root",
      },
      [],
      paths
    );
    writeSshConfig(created.servers, paths);
    const pinned = pinFingerprint(
      created.servers,
      created.server.id,
      "SHA256:x"
    );
    writeSshConfig(pinned, paths);
    await untrustHost(created.server, paths);
    const left = removeServer(pinned, created.server.id, paths);
    writeSshConfig(left, paths);

    expect(hash(sshConfig)).toBe(before);
    expect(
      existsSync(join(homedir(), ".ssh", "config"))
        ? hash(join(homedir(), ".ssh", "config"))
        : null
    ).toBe(userBefore);
    expect(readFileSync(sshConfig, "utf8")).toBe(SYSTEM_CONFIG);
  });

  it("écrit tout ce qu'il écrit dans le dossier de données de l'app", async () => {
    const data = userData();
    const paths = appSshPaths(data);

    const created = await addServer(
      {
        host: "203.0.113.10",
        key: { mode: "generate" },
        name: "Staging",
        port: 2222,
        user: "root",
      },
      [],
      paths
    );
    writeSshConfig(created.servers, paths);

    expect(created.server.keyPath?.startsWith(data)).toBe(true);
    expect(paths.configPath.startsWith(data)).toBe(true);
    expect(paths.knownHostsPath.startsWith(data)).toBe(true);
    expect(statSync(created.server.keyPath ?? "").mode & 0o777).toBe(0o600);
  });

  it("garde la clé publique à portée, avec sa commande ssh-copy-id", async () => {
    const paths = appSshPaths(userData());

    const created = await addServer(
      {
        host: "203.0.113.10",
        key: { mode: "generate" },
        name: "Staging",
        port: 22,
        user: "root",
      },
      [],
      paths
    );

    expect(created.publicKey?.startsWith("ssh-ed25519 ")).toBe(true);
    expect(created.copyId).toContain("ssh-copy-id -i ");
    expect(created.copyId).toContain("root@203.0.113.10");
  });
});

describe("un hôte déjà déclaré dans le système", () => {
  it("n'ouvre ni clé ni bloc de configuration : l'app n'écrit rien pour lui", async () => {
    const paths = appSshPaths(userData());

    const created = await addServer(
      {
        host: "dev-vps",
        key: { host: "dev-vps", mode: "system" },
        name: "Poste",
        port: 22,
        user: "",
      },
      [],
      paths
    );
    writeSshConfig(created.servers, paths);

    expect(created.server.origin).toBe("system");
    expect(created.server.keyPath).toBeUndefined();
    expect(created.publicKey).toBe(null);
    expect(readFileSync(paths.configPath, "utf8")).not.toContain("dev-vps");
  });
});

describe("ce que le formulaire refuse", () => {
  it("dit ce qui ne va pas dans l'adresse, le port et l'utilisateur", async () => {
    const paths = appSshPaths(userData());
    const draft = {
      host: "203.0.113.10",
      key: { mode: "generate" } as const,
      name: "Staging",
      port: 22,
      user: "root",
    };

    expect(addServer({ ...draft, host: "" }, [], paths)).rejects.toBeInstanceOf(
      SetupError
    );
    expect(addServer({ ...draft, port: 0 }, [], paths)).rejects.toBeInstanceOf(
      SetupError
    );
    expect(
      addServer({ ...draft, user: "root; rm -rf /" }, [], paths)
    ).rejects.toBeInstanceOf(SetupError);
  });

  it("porte un remède avec son refus", async () => {
    const paths = appSshPaths(userData());

    try {
      await addServer(
        {
          host: "203.0.113.10 ; whoami",
          key: { mode: "generate" },
          name: "Staging",
          port: 22,
          user: "root",
        },
        [],
        paths
      );
      throw new Error("attendu : un refus");
    } catch (error) {
      expect(error).toBeInstanceOf(SetupError);
      expect((error as SetupError).phrase.id).toStartWith("refusal.");
    }
  });
});

describe("la suppression d'un serveur", () => {
  it("emporte la clé du dossier de l'app", async () => {
    const paths = appSshPaths(userData());
    const created = await addServer(
      {
        host: "203.0.113.10",
        key: { mode: "generate" },
        name: "Staging",
        port: 22,
        user: "root",
      },
      [],
      paths
    );
    const keyPath = created.server.keyPath ?? "";

    const left = removeServer(created.servers, created.server.id, paths);

    expect(left).toEqual([]);
    expect(existsSync(keyPath)).toBe(false);
  });
});
