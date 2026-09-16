import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import { alias, sshNames } from "@shared/ssh-names";
import { current, multiplexes, type Platform } from "./platform";
import { trace } from "./trace";

/**
 * The SSH configuration the app owns, and only that one.
 *
 * Everything the app needs to reach a server it writes into its own file,
 * passed to `ssh` with `-F`. The user's ~/.ssh/config is read — to offer the
 * hosts already declared there — and never written: someone who spent years
 * shaping that file should not find it rearranged by an app they installed
 * yesterday.
 */

/** The length a Unix domain socket path cannot exceed, on Linux and on macOS. */
export const CONTROL_PATH_LIMIT = 104;

/** `%C` in a ControlPath: the sha1 of host, port, user and local host, in hex. */
const CONTROL_HASH_LENGTH = 40;

/** ssh binds the socket under `<path>.XXXXXXXXXX` first, then renames it. */
const CONTROL_TEMP_SUFFIX = 11;

const DEFAULT_PORT = 22;
const DIR_MODE = 0o700;
/** `mode % PERMISSION_BITS` keeps rwx for user, group and others; `% SHARED_BITS` what group and others got. */
const PERMISSION_BITS = 0o1000;
const SHARED_BITS = 0o100;
const FILE_MODE = 0o600;
const HOST_LINE = /^\s*Host\s+(.+)$/i;
const SPACES = /\s+/;
const WHITESPACE = /\s/;

const HEADER = `# Written by Pupitre. Your own ~/.ssh/config is never touched.
# Passed to ssh with -F: nothing here leaks into your system configuration.

`;

export interface SshPaths {
  dir: string;
  configPath: string;
  knownHostsPath: string;
  keysDir: string;
}

export function appSshPaths(userData: string): SshPaths {
  const dir = join(userData, "ssh");

  return {
    configPath: join(dir, "config"),
    dir,
    keysDir: join(userData, "keys"),
    knownHostsPath: join(dir, "known_hosts"),
  };
}

export type Address = Pick<Server, "host" | "port">;

export function knownHostsKey(server: Address): string {
  return server.port === DEFAULT_PORT
    ? server.host
    : `[${server.host}]:${server.port}`;
}

/**
 * The folder the multiplexing sockets live in: one per user, and theirs alone.
 *
 * A socket path over 104 characters is refused by the kernel, and the app's own
 * data folder — "~/Library/Application Support/Pupitre Desktop/ssh" — eats most
 * of that budget before the file name starts; so does the per-user temporary
 * folder macOS hands out. So the sockets live in /tmp, in a folder named after
 * the user and opened to nobody else, the way ssh keeps its own agent sockets.
 * A folder squatted by another account is refused rather than used: the
 * connection then runs without a master, which is slower and still safe.
 */
export function controlDir(uid: number, tmp = "/tmp"): string {
  return join(tmp, `pupitre-${uid}`);
}

/**
 * The socket itself, named by ssh from the host, the port and the account.
 *
 * The account is part of the name because `ssh` picks a master by its socket
 * alone: a session opened as root would go on serving the calls made as dev,
 * and would answer for a door that has just been closed.
 */
export function controlPath(dir: string): string {
  return join(dir, "%C");
}

/** Whether a socket in this folder, temporary name included, fits the kernel's limit. */
export function controlPathFits(dir: string): boolean {
  return (
    controlPath(dir).length -
      "%C".length +
      CONTROL_HASH_LENGTH +
      CONTROL_TEMP_SUFFIX <
    CONTROL_PATH_LIMIT
  );
}

/**
 * The folder, made or checked: a directory, not a link, owned by this user and
 * closed to the others. Anything else is someone else's, and is left alone.
 */
export function ensureControlDir(dir: string, uid: number): boolean {
  try {
    mkdirSync(dir, { mode: DIR_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      return false;
    }
  }

  try {
    const stat = lstatSync(dir);

    if (!stat.isDirectory() || stat.uid !== uid) {
      return false;
    }

    if ((stat.mode % PERMISSION_BITS) % SHARED_BITS !== 0) {
      chmodSync(dir, DIR_MODE);
    }

    return true;
  } catch {
    return false;
  }
}

function currentUid(): number | null {
  return process.getuid ? process.getuid() : null;
}

/** Where this user's sockets go, or nothing when the folder cannot be theirs. */
function usableControlDir(): string | null {
  const uid = currentUid();

  if (uid === null) {
    return null;
  }

  const dir = controlDir(uid);

  if (!controlPathFits(dir)) {
    return null;
  }

  if (!ensureControlDir(dir, uid)) {
    trace("ssh", "control-dir-refused", { dir });

    return null;
  }

  return dir;
}

/**
 * A path as an argument of the configuration file.
 *
 * "Application Support" on macOS and "C:\Users\Jean Dupont" on Windows both
 * carry a space, and ssh reads a bare argument up to the first one, then calls
 * the rest garbage and refuses the whole file. Quotes are what its parser
 * accepts, and only where they are needed, so a plain path stays plain.
 */
export function argument(value: string): string {
  return WHITESPACE.test(value) ? `"${value}"` : value;
}

function block(
  server: Server,
  name: string,
  paths: SshPaths,
  platform: Platform,
  control: string | null
): string {
  const names = name === alias(server) ? name : `${alias(server)} ${name}`;
  const lines = [
    `Host ${names}`,
    `  HostName ${server.host}`,
    `  Port ${server.port}`,
    `  User ${server.user}`,
  ];

  if (server.keyPath) {
    lines.push(`  IdentityFile ${argument(server.keyPath)}`);
  }

  lines.push(
    "  IdentitiesOnly yes",
    `  UserKnownHostsFile ${argument(paths.knownHostsPath)}`,
    `  StrictHostKeyChecking ${server.hostFingerprint ? "yes" : "accept-new"}`
  );

  if (multiplexes(platform) && control) {
    lines.push(
      "  ControlMaster auto",
      `  ControlPath ${argument(controlPath(control))}`,
      "  ControlPersist 10m"
    );
  }

  lines.push("  ServerAliveInterval 30");

  return `${lines.join("\n")}\n`;
}

/**
 * A host taken from the system configuration gets no block: the app promised to
 * write nothing for it, and a block of ours would quietly override it. The
 * hosts that file declares are reserved for the same reason: once it includes
 * ours, a name of ours that matched one of theirs would answer in its place.
 */
export function renderSshConfig(
  servers: Server[],
  paths: SshPaths,
  platform: Platform = current(),
  control: string | null = controlDir(currentUid() ?? 0),
  reserved: readonly string[] = []
): string {
  const names = sshNames(servers, reserved);
  const blocks = servers
    .filter((server) => server.origin === "app")
    .map((server) =>
      block(
        server,
        names.get(server.id) ?? alias(server),
        paths,
        platform,
        control
      )
    );

  return `${HEADER}${blocks.join("\n")}`;
}

export function writeSshConfig(
  servers: Server[],
  paths: SshPaths,
  reserved: readonly string[] = []
): void {
  mkdirSync(paths.dir, { mode: DIR_MODE, recursive: true });
  chmodSync(paths.dir, DIR_MODE);

  writeFileSync(
    paths.configPath,
    renderSshConfig(servers, paths, current(), usableControlDir(), reserved),
    { mode: FILE_MODE }
  );
  chmodSync(paths.configPath, FILE_MODE);

  if (!existsSync(paths.knownHostsPath)) {
    writeFileSync(paths.knownHostsPath, "", { mode: FILE_MODE });
  }
}

export function sshArgs(server: Server, paths: SshPaths): string[] {
  return server.origin === "system"
    ? [server.host]
    : ["-F", paths.configPath, alias(server)];
}

/**
 * The hosts the user already declared, so they can be picked rather than
 * retyped. Wildcard patterns are dropped: "Host *" is not a machine.
 */
export function readSystemHosts(file: string): string[] {
  if (!existsSync(file)) {
    return [];
  }

  try {
    const hosts: string[] = [];

    for (const line of readFileSync(file, "utf8").split("\n")) {
      const found = HOST_LINE.exec(line);
      if (!found) {
        continue;
      }

      for (const name of found[1].trim().split(SPACES)) {
        const pattern =
          name.includes("*") || name.includes("?") || name.startsWith("!");
        if (!(pattern || hosts.includes(name))) {
          hosts.push(name);
        }
      }
    }

    return hosts;
  } catch {
    return [];
  }
}
