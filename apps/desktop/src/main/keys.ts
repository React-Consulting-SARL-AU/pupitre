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
import type { ErrorPhrase } from "@shared/agent";
import type { Server } from "@shared/servers";

const SPACES = /\s+/;

const run = promisify(execFile);

const SERVER_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const DEFAULT_PORT = 22;
const DIR_MODE = 0o700;
const PRIVATE_MODE = 0o600;
const PUBLIC_MODE = 0o644;

export class KeyError extends Error {
  readonly phrase: ErrorPhrase;

  constructor(id: string, values?: Record<string, string | number>) {
    super(id);
    this.name = "KeyError";
    this.phrase = values ? { id, values } : { id };
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
    throw new KeyError("refusal.key.name", { serverId });
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
    throw new KeyError("refusal.key.generate");
  }

  return seal(paths);
}

/** Drops the comment: an imported key's comment names another machine's hostname. */
async function publicHalf(keyPath: string): Promise<string> {
  try {
    const { stdout } = await run("ssh-keygen", ["-y", "-f", keyPath]);

    return stdout.trim().split(SPACES).slice(0, 2).join(" ");
  } catch {
    throw new KeyError("refusal.key.unreadable");
  }
}

/** Copied rather than referenced: a file the app does not own could vanish in someone else's cleanup. */
export async function importKey(
  dir: string,
  serverId: string,
  source: string
): Promise<KeyPair> {
  const paths = keyPaths(dir, serverId);

  if (!existsSync(source)) {
    throw new KeyError("refusal.key.missing", { source });
  }

  if (!readFileSync(source, "utf8").includes("PRIVATE KEY")) {
    throw new KeyError("refusal.key.public");
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

const PLAIN_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** The app folder on macOS is `~/Library/Application Support/…`, whose space a shell would split. */
function shellArgument(value: string): string {
  return PLAIN_ARGUMENT.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export function copyIdCommand(server: Server, publicKeyPath: string): string {
  const port = server.port === DEFAULT_PORT ? [] : ["-p", String(server.port)];

  return [
    "ssh-copy-id",
    "-i",
    shellArgument(publicKeyPath),
    ...port,
    shellArgument(`${server.user}@${server.host}`),
  ].join(" ");
}
