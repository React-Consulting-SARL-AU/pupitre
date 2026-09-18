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
  sharesAddress,
  untrustHost,
} from "../server-setup";
import {
  appSshPaths,
  renderSshConfig,
  type SshPaths,
  writeSshConfig,
} from "../ssh-config";

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

/** A home inside the folder under test: the link lands there, not in the developer's. */
function pathsIn(data: string): SshPaths {
  return appSshPaths(data, join(data, "home"));
}

describe("le parcours d'ajout d'un serveur", () => {
  it("ne modifie jamais le ~/.ssh/config de l'utilisateur", async () => {
    const { sshConfig } = fakeHome();
    const paths = pathsIn(userData());
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
    const paths = pathsIn(data);

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
    const paths = pathsIn(userData());

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
    const paths = pathsIn(userData());

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

describe("le nom SSH d'un serveur ajouté", () => {
  const draft = {
    host: "203.0.113.10",
    key: { mode: "generate" } as const,
    name: "Atelier d'Été",
    port: 22,
    user: "root",
  };

  it("est le mot tapé, mis en forme pour une ligne Host", async () => {
    const paths = pathsIn(userData());

    const created = await addServer({ ...draft, slug: "Prod VPS" }, [], paths);

    expect(created.server.slug).toBe("prod-vps");
    expect(renderSshConfig(created.servers, paths)).toContain(
      `Host pupitre-${created.server.id} prod-vps\n`
    );
  });

  it("vient du nom quand rien n'est tapé, et manque quand ce mot est pris", async () => {
    const paths = pathsIn(userData());

    const first = await addServer(draft, [], paths);
    const second = await addServer(draft, first.servers, paths);
    const third = await addServer(
      { ...draft, name: "Bastion" },
      second.servers,
      paths,
      ["bastion"]
    );

    expect(first.server.slug).toBe("atelier-d-ete");
    expect(second.server.slug).toBeUndefined();
    expect(third.server.slug).toBeUndefined();
  });

  it("refuse un mot tapé qui ne tient pas, ou qui désigne déjà une machine", async () => {
    const paths = pathsIn(userData());
    const held = await addServer({ ...draft, slug: "atelier" }, [], paths);

    await expect(
      addServer({ ...draft, slug: "···" }, [], paths)
    ).rejects.toMatchObject({ phrase: { id: "refusal.setup.sshName" } });
    await expect(
      addServer({ ...draft, slug: "atelier" }, held.servers, paths)
    ).rejects.toMatchObject({ phrase: { id: "refusal.setup.sshNameTaken" } });
    await expect(
      addServer({ ...draft, slug: "bastion" }, [], paths, ["bastion"])
    ).rejects.toMatchObject({ phrase: { id: "refusal.setup.sshNameTaken" } });
  });

  it("n'en donne pas à un hôte du système, qui est son propre alias", async () => {
    const paths = pathsIn(userData());

    const created = await addServer(
      { ...draft, key: { host: "dev-vps", mode: "system" }, slug: "vps" },
      [],
      paths
    );

    expect(created.server.slug).toBeUndefined();
  });
});

describe("ce que le formulaire refuse", () => {
  it("dit ce qui ne va pas dans l'adresse, le port et l'utilisateur", async () => {
    const paths = pathsIn(userData());
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
    const paths = pathsIn(userData());

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
    const paths = pathsIn(userData());
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

describe("l'adresse qu'une épingle appartient à", () => {
  const atelier = {
    host: "203.0.113.10",
    id: "srv-a",
    name: "Atelier",
    origin: "app" as const,
    port: 22,
    user: "root",
  };

  it("est partagée par un autre serveur de l'app au même hôte et au même port", () => {
    const twin = { ...atelier, id: "srv-b", user: "dev" };

    expect(sharesAddress([atelier, twin], atelier, "srv-a")).toBe(true);
    expect(sharesAddress([atelier], atelier, "srv-a")).toBe(false);
    expect(
      sharesAddress([atelier, { ...twin, port: 2222 }], atelier, "srv-a")
    ).toBe(false);
  });

  it("ne compte pas un hôte du système, dont l'app n'épingle rien", () => {
    const declared = { ...atelier, id: "srv-c", origin: "system" as const };

    expect(sharesAddress([declared], atelier)).toBe(false);
  });
});
