import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";

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

const DEFAULT_PORT = 22;
const SOCKET_PRINT = 12;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const HOST_LINE = /^\s*Host\s+(.+)$/i;

const HEADER = `# Written by Pupitre. Your own ~/.ssh/config is never touched.
# Passed to ssh with -F: nothing here leaks into your system configuration.

`;

export type SshPaths = {
  dir: string;
  configPath: string;
  knownHostsPath: string;
  keysDir: string;
};

export function appSshPaths(userData: string): SshPaths {
  const dir = join(userData, "ssh");

  return {
    configPath: join(dir, "config"),
    dir,
    keysDir: join(userData, "keys"),
    knownHostsPath: join(dir, "known_hosts"),
  };
}

/** A server of the app is named by its identifier: an address can move. */
export function alias(server: Server): string {
  return server.origin === "system" ? server.host : `pupitre-${server.id}`;
}

export function knownHostsKey(server: Server): string {
  return server.port === DEFAULT_PORT
    ? server.host
    : `[${server.host}]:${server.port}`;
}

/**
 * The multiplexing socket, kept short on purpose.
 *
 * A socket path over 104 characters is refused by the kernel, and the app's own
 * data folder — "~/Library/Application Support/Pupitre Desktop/ssh" — eats most
 * of that budget before the file name starts. So the socket lives in /tmp under
 * a print of the data folder, the server and the account: short, unique per
 * server, and unique per installation, so two accounts on the same machine
 * never share one. The account is part of the print because `ssh` picks a
 * master by its socket alone: a session opened as root would go on serving the
 * calls made as dev, and would answer for a door that has just been closed.
 */
export function controlPath(paths: SshPaths, server: Server): string {
  const print = createHash("sha256")
    .update(`${paths.dir} ${server.id} ${server.user}`)
    .digest("hex")
    .slice(0, SOCKET_PRINT);

  const root = process.platform === "win32" ? tmpdir() : "/tmp";

  return join(root, `pupitre-${print}`);
}

function block(server: Server, paths: SshPaths): string {
  const lines = [
    `Host ${alias(server)}`,
    `  HostName ${server.host}`,
    `  Port ${server.port}`,
    `  User ${server.user}`,
  ];

  if (server.keyPath) {
    lines.push(`  IdentityFile ${server.keyPath}`);
  }

  lines.push(
    "  IdentitiesOnly yes",
    `  UserKnownHostsFile ${paths.knownHostsPath}`,
    `  StrictHostKeyChecking ${server.hostFingerprint ? "yes" : "accept-new"}`,
    "  ControlMaster auto",
    `  ControlPath ${controlPath(paths, server)}`,
    "  ControlPersist 10m",
    "  ServerAliveInterval 30"
  );

  return `${lines.join("\n")}\n`;
}

/**
 * A host taken from the system configuration gets no block: the app promised to
 * write nothing for it, and a block of ours would quietly override it.
 */
export function renderSshConfig(servers: Server[], paths: SshPaths): string {
  const blocks = servers
    .filter((server) => server.origin === "app")
    .map((server) => block(server, paths));

  return `${HEADER}${blocks.join("\n")}`;
}

export function writeSshConfig(servers: Server[], paths: SshPaths): void {
  mkdirSync(paths.dir, { mode: DIR_MODE, recursive: true });
  chmodSync(paths.dir, DIR_MODE);

  writeFileSync(paths.configPath, renderSshConfig(servers, paths), {
    mode: FILE_MODE,
  });
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

      for (const name of found[1].trim().split(/\s+/)) {
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
