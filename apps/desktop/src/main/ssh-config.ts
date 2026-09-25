import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { isSshHost, isSshPort, isSshUser } from "@pupitre/shared/ssh";
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
const HOST_NAME = /^[A-Za-z0-9._-]+$/;
const UNSAFE_PATH = /[\p{Cc}"]/u;

const HEADER = `# Written by Pupitre. Your own ~/.ssh/config is never touched.
# Passed to ssh with -F: nothing here leaks into your system configuration.

`;

export interface SshPaths {
  /** The app's data folder, which everything below lives in. */
  root: string;
  dir: string;
  configPath: string;
  knownHostsPath: string;
  keysDir: string;
  /** The whitespace-free way into `root`, for the readers that split on spaces. */
  link: string;
}

const LINK_DIR = ".pupitre";
const NOT_A_WORD = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-|-$/g;

/** `Pupitre Dev (app.pupitre.studio)` becomes `pupitre-dev-app-pupitre-studio`. */
function linkName(userData: string): string {
  return basename(userData)
    .toLowerCase()
    .replace(NOT_A_WORD, "-")
    .replace(EDGE_DASHES, "");
}

export function appSshPaths(userData: string, home = homedir()): SshPaths {
  const dir = join(userData, "ssh");

  return {
    configPath: join(dir, "config"),
    dir,
    keysDir: join(userData, "keys"),
    knownHostsPath: join(dir, "known_hosts"),
    link: join(home, LINK_DIR, linkName(userData)),
    root: userData,
  };
}

function pointsAtRoot(paths: SshPaths): boolean {
  try {
    return realpathSync(paths.link) === realpathSync(paths.root);
  } catch {
    return false;
  }
}

/**
 * The link stood up, or checked, and its path; nothing when the place is taken.
 *
 * `~/Library/Application Support` carries a space, and so may a Windows
 * profile. OpenSSH reads a quoted path, but JetBrains Gateway parses the same
 * file with its own code and splits `IdentityFile` and `UserKnownHostsFile` on
 * whitespace, quotes or not — then, pinned to strict checking, refuses without
 * asking. So the app's file names its key and its known hosts through a link
 * in a folder the app names itself, where no space can get in. A junction on
 * Windows, which needs no privilege. A link that points elsewhere is the app's
 * own, left by a data folder that moved, and is taken back; anything that is
 * not a link belongs to someone else and is left alone.
 */
export function ensureLink(paths: SshPaths): string | null {
  try {
    const stat = lstatSync(paths.link, { throwIfNoEntry: false });

    if (stat?.isSymbolicLink()) {
      if (pointsAtRoot(paths)) {
        return paths.link;
      }

      unlinkSync(paths.link);
    } else if (stat) {
      trace("ssh", "link-taken", { link: paths.link });

      return null;
    }

    mkdirSync(dirname(paths.link), { mode: DIR_MODE, recursive: true });
    symlinkSync(paths.root, paths.link, "junction");

    return paths.link;
  } catch (error) {
    trace("ssh", "link-refused", {
      error: (error as NodeJS.ErrnoException).code,
      link: paths.link,
    });

    return null;
  }
}

/** A file of the data folder, named through the link when it stands. */
function through(paths: SshPaths, link: string | null, path: string): string {
  if (!link) {
    return path;
  }

  const inside = relative(paths.root, path);

  return inside.startsWith("..") || isAbsolute(inside)
    ? path
    : join(link, inside);
}

/** The key of a server as the app's file names it, for a client that asks for the path. */
export function identityFile(
  server: Server,
  paths: SshPaths,
  link: string | null
): string | null {
  return server.keyPath ? through(paths, link, server.keyPath) : null;
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

/** Checked again at the last moment: a newline or a quote here would become a directive of its own. */
function fitForConfig(
  server: Server,
  names: readonly string[],
  files: readonly string[]
): boolean {
  return (
    isSshHost(server.host) &&
    isSshUser(server.user) &&
    isSshPort(server.port) &&
    names.every((name) => HOST_NAME.test(name)) &&
    files.every((file) => !UNSAFE_PATH.test(file))
  );
}

function block(
  server: Server,
  name: string,
  paths: SshPaths,
  platform: Platform,
  control: string | null,
  link: string | null
): string | null {
  const names = name === alias(server) ? [name] : [alias(server), name];
  const identity = server.keyPath ? through(paths, link, server.keyPath) : null;
  const knownHosts = through(paths, link, paths.knownHostsPath);
  const socket = multiplexes(platform) && control ? controlPath(control) : null;
  const files = [identity, knownHosts, socket].filter(
    (file): file is string => file !== null
  );

  if (!fitForConfig(server, names, files)) {
    trace("ssh", "block-refused", { id: server.id });

    return null;
  }

  const lines = [
    `Host ${names.join(" ")}`,
    `  HostName ${server.host}`,
    `  Port ${server.port}`,
    `  User ${server.user}`,
  ];

  if (identity) {
    lines.push(`  IdentityFile ${argument(identity)}`);
  }

  lines.push(
    "  IdentitiesOnly yes",
    `  UserKnownHostsFile ${argument(knownHosts)}`,
    `  StrictHostKeyChecking ${server.hostFingerprint ? "yes" : "accept-new"}`
  );

  if (socket) {
    lines.push(
      "  ControlMaster auto",
      `  ControlPath ${argument(socket)}`,
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
  reserved: readonly string[] = [],
  link: string | null = null
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
        control,
        link
      )
    )
    .filter((written): written is string => written !== null);

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
    renderSshConfig(
      servers,
      paths,
      current(),
      usableControlDir(),
      reserved,
      ensureLink(paths)
    ),
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
