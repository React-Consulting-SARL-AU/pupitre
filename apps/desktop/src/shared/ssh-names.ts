import type { Server } from "./servers";

const NAME_LIMIT = 63;
const ACCENTS = /\p{Mn}/gu;
const UNFIT = /[^a-z0-9-]+/g;
const EDGES = /^-+|-+$/g;
const SERVER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The identifier names a `Host` line and a key file: nothing in it may leave either. */
export function isServerId(id: unknown): id is string {
  return typeof id === "string" && SERVER_ID.test(id);
}

/** Named by identifier rather than address, since an address can move. */
export function alias(server: Server): string {
  return server.origin === "system" ? server.host : `pupitre-${server.id}`;
}

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

/** A chosen SSH name already claimed by a system host, an alias or an earlier server falls back to the alias. */
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

export interface SshShareServer {
  id: string;
  name: string;
  ssh: string;
  user: string;
  host: string;
  port: number;
  /** Named through the ~/.pupitre link; null on a system host. */
  identityFile: string | null;
}

export interface SshShareState {
  shared: boolean;
  userConfigPath: string;
  line: string;
  servers: SshShareServer[];
}
