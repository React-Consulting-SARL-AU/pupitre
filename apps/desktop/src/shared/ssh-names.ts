import type { Server } from "./servers";

/**
 * What a server is called on a `Host` line, and what a person types after `ssh`.
 *
 * A server of the app is written under its identifier, since an address can
 * move; a host of the system is its own alias. Beside the identifier, the block
 * also carries the SSH name the reader chose for it, when nothing else answers
 * to it: that is the word a reader types in a terminal or hands an editor, and
 * it cannot be a word that already names another machine.
 */

const NAME_LIMIT = 63;
const ACCENTS = /\p{Mn}/gu;
const UNFIT = /[^a-z0-9-]+/g;
const EDGES = /^-+|-+$/g;

/** A server of the app is named by its identifier: an address can move. */
export function alias(server: Server): string {
  return server.origin === "system" ? server.host : `pupitre-${server.id}`;
}

/** What was typed, as ssh accepts it on a `Host` line, or nothing when none of it survives. */
export function sshSlug(typed: string): string | null {
  const slug = typed
    .normalize("NFD")
    .replace(ACCENTS, "")
    .toLowerCase()
    .replace(UNFIT, "-")
    .replace(EDGES, "")
    .slice(0, NAME_LIMIT)
    .replace(EDGES, "");

  return slug && !slug.startsWith("pupitre-") ? slug : null;
}

/**
 * Whether a word names no other machine: no host of the system's own file, no
 * identifier, and no SSH name of another server of the list.
 */
export function sshNameFree(
  slug: string,
  servers: readonly Server[],
  reserved: readonly string[],
  self?: string
): boolean {
  if (reserved.includes(slug)) {
    return false;
  }

  return servers.every(
    (server) =>
      alias(server) !== slug && (server.id === self || server.slug !== slug)
  );
}

/**
 * The name each server of the app answers to, by identifier: its SSH name when
 * no host of the system's own file, no earlier server and no identifier claims
 * it, the alias alone otherwise. A host of the system keeps its own name.
 */
export function sshNames(
  servers: readonly Server[],
  reserved: readonly string[]
): Map<string, string> {
  const taken = new Set([
    ...reserved,
    ...servers.map((server) => alias(server)),
  ]);
  const names = new Map<string, string>();

  for (const server of servers) {
    if (server.origin === "system") {
      names.set(server.id, server.host);
      continue;
    }

    if (server.slug && !taken.has(server.slug)) {
      taken.add(server.slug);
      names.set(server.id, server.slug);
    } else {
      names.set(server.id, alias(server));
    }
  }

  return names;
}

/**
 * One server of the app, and what another client needs to reach it: the word
 * that names it once the file is shared, and the account, the address, the
 * port and the key a client that reads no configuration file asks for.
 */
export interface SshShareServer {
  id: string;
  name: string;
  ssh: string;
  user: string;
  host: string;
  port: number;
  /** The key as the app's file names it, through the link; null on a system host. */
  identityFile: string | null;
}

/** What a settings screen reads about the system's own SSH file. */
export interface SshShareState {
  /** Whether that file includes the app's, so `ssh`, editors and agents reach the servers by name. */
  shared: boolean;
  /** The system's own file, the one line goes in. */
  userConfigPath: string;
  /** The one line itself, as it is written. */
  line: string;
  servers: SshShareServer[];
}
