import { execFile } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Server } from "@shared/servers";

const SPACES = /\s+/;

/**
 * The keys the app owns, one per server, in its own data folder.
 *
 * Nothing here ever reaches ~/.ssh: a key made for this computer stays in the
 * app's folder, in 0600, and leaves it only by its public half. A key someone
 * already had is copied in rather than referenced where it sits, so that
 * deleting the server really takes the key the app was using with it.
 */

const run = promisify(execFile);

const SERVER_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const DEFAULT_PORT = 22;
const DIR_MODE = 0o700;
const PRIVATE_MODE = 0o600;
const PUBLIC_MODE = 0o644;

export class KeyError extends Error {
  readonly fix: string;

  constructor(message: string, fix: string) {
    super(message);
    this.name = "KeyError";
    this.fix = fix;
  }
}

export interface KeyPaths {
  keyPath: string;
  publicKeyPath: string;
}

export type KeyPair = KeyPaths & {
  publicKey: string;
};

export function keyPaths(dir: string, serverId: string): KeyPaths {
  if (!SERVER_ID.test(serverId)) {
    throw new KeyError(
      `« ${serverId} » ne peut pas nommer une clé.`,
      "Un identifiant de lettres, de chiffres et de tirets : rien qui puisse désigner un autre dossier."
    );
  }

  const keyPath = join(dir, serverId);

  return { keyPath, publicKeyPath: `${keyPath}.pub` };
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { mode: DIR_MODE, recursive: true });
  chmodSync(dir, DIR_MODE);
}

function seal(paths: KeyPaths): KeyPair {
  chmodSync(paths.keyPath, PRIVATE_MODE);
  chmodSync(paths.publicKeyPath, PUBLIC_MODE);

  return {
    ...paths,
    publicKey: readFileSync(paths.publicKeyPath, "utf8").trim(),
  };
}

export async function generateKey(
  dir: string,
  serverId: string
): Promise<KeyPair> {
  const paths = keyPaths(dir, serverId);

  ensureDir(dir);
  rmSync(paths.keyPath, { force: true });
  rmSync(paths.publicKeyPath, { force: true });

  try {
    await run("ssh-keygen", [
      "-t",
      "ed25519",
      "-N",
      "",
      "-q",
      "-C",
      `pupitre ${serverId}`,
      "-f",
      paths.keyPath,
    ]);
  } catch {
    throw new KeyError(
      "ssh-keygen n'a pas pu créer la clé.",
      "Installez OpenSSH sur cet ordinateur, ou importez une clé que vous avez déjà."
    );
  }

  return seal(paths);
}

/**
 * The public half derived from the private one, without its comment.
 *
 * The comment travels with an imported key and names the machine it was made
 * on, which is not this one: keeping it would put someone else's hostname in
 * the line we ask the user to paste on their server.
 */
async function publicHalf(keyPath: string): Promise<string> {
  try {
    const { stdout } = await run("ssh-keygen", ["-y", "-f", keyPath]);
    return stdout.trim().split(SPACES).slice(0, 2).join(" ");
  } catch {
    throw new KeyError(
      "Cette clé privée n'a pas pu être lue.",
      "Une clé protégée par une phrase de passe ne convient pas ici : importez-en une sans phrase de passe, ou laissez l'app en générer une."
    );
  }
}

/**
 * A key someone already had, copied in rather than pointed at.
 *
 * Pointing at it would leave the app depending on a file it does not own, which
 * a cleanup elsewhere would take away without warning.
 */
export async function importKey(
  dir: string,
  serverId: string,
  source: string
): Promise<KeyPair> {
  const paths = keyPaths(dir, serverId);

  if (!existsSync(source)) {
    throw new KeyError(
      `Le fichier ${source} est introuvable.`,
      "Choisissez le fichier de la clé, celui qui ne porte pas l'extension .pub."
    );
  }

  if (!readFileSync(source, "utf8").includes("PRIVATE KEY")) {
    throw new KeyError(
      "Ce fichier n'est pas une clé privée.",
      "Prenez la moitié privée — « id_ed25519 » — et non le « id_ed25519.pub » qui l'accompagne."
    );
  }

  ensureDir(dir);
  copyFileSync(source, paths.keyPath);
  chmodSync(paths.keyPath, PRIVATE_MODE);

  const derived = await publicHalf(paths.keyPath);
  writeFileSync(paths.publicKeyPath, `${derived}\n`, { mode: PUBLIC_MODE });

  return seal(paths);
}

export function readPublicKey(dir: string, serverId: string): string | null {
  let paths: KeyPaths;
  try {
    paths = keyPaths(dir, serverId);
  } catch {
    return null;
  }

  if (!existsSync(paths.publicKeyPath)) {
    return null;
  }

  return readFileSync(paths.publicKeyPath, "utf8").trim();
}

export function removeKey(dir: string, serverId: string): void {
  let paths: KeyPaths;
  try {
    paths = keyPaths(dir, serverId);
  } catch {
    return;
  }

  rmSync(paths.keyPath, { force: true });
  rmSync(paths.publicKeyPath, { force: true });
}

/** The line to paste on the server, ready to run, with nothing to fill in. */
export function copyIdCommand(server: Server, publicKeyPath: string): string {
  const port = server.port === DEFAULT_PORT ? [] : ["-p", String(server.port)];

  return [
    "ssh-copy-id",
    "-i",
    publicKeyPath,
    ...port,
    `${server.user}@${server.host}`,
  ].join(" ");
}
