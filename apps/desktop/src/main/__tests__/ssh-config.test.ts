import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import {
  alias,
  appSshPaths,
  CONTROL_PATH_LIMIT,
  controlPath,
  knownHostsKey,
  readSystemHosts,
  renderSshConfig,
  sshArgs,
  writeSshConfig,
} from "../ssh-config";

function userData(): string {
  return mkdtempSync(join(tmpdir(), "pupitre-userdata-"));
}

const APP_SERVER: Server = {
  host: "203.0.113.10",
  hostFingerprint: undefined,
  id: "srv-a",
  keyPath: "/data/keys/srv-a",
  name: "Staging",
  origin: "app",
  port: 22,
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

    expect(config).toContain("Host pupitre-srv-a");
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

  it("s'écrit en 0600 dans un dossier 0700", () => {
    const paths = appSshPaths(userData());

    writeSshConfig([APP_SERVER], paths);

    expect(statSync(paths.configPath).mode & 0o777).toBe(0o600);
    expect(statSync(paths.dir).mode & 0o777).toBe(0o700);
    expect(readFileSync(paths.configPath, "utf8")).toContain(
      "Host pupitre-srv-a"
    );
  });
});

describe("le chemin de multiplexage", () => {
  it("tient dans la limite d'un socket Unix, dossier de données compris", () => {
    const long = join(
      "/Users/quelquun/Library/Application Support/Pupitre Desktop"
    );
    const paths = appSshPaths(long);

    const path = controlPath(paths, APP_SERVER);

    expect(path.length).toBeLessThan(CONTROL_PATH_LIMIT);
    expect(path.startsWith(paths.dir)).toBe(false);
  });

  it("donne à chaque serveur un socket qui lui est propre", () => {
    const paths = appSshPaths("/data");

    expect(controlPath(paths, APP_SERVER)).not.toBe(
      controlPath(paths, { ...APP_SERVER, id: "srv-c" })
    );
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
