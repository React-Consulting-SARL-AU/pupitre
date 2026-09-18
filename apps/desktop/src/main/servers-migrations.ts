import type { JsonObject, StoreMigration } from "./store-migrations";

/**
 * The ledger of `servers.json`.
 *
 * It starts at 3, the revision the file was already stamped with when the app
 * became the owner of the connection: a server carries its address, its port,
 * its account and its key rather than pointing at a block of the system
 * configuration. Anything below 3 is completed by `normalise`, as it always
 * was, and nothing is gained by writing after the fact the two shapes that
 * became today's.
 *
 * Adding an entry is the whole of what a shape change costs from here on — see
 * docs/contracts/config-migrations.md.
 */
export const SERVERS_BASELINE = 3;

export const SERVERS_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: sshNameFromName,
    id: 4,
    slug: "ssh-name-from-name",
  },
];

const NAME_LIMIT = 63;
const ACCENTS = /\p{Mn}/gu;
const UNFIT = /[^a-z0-9-]+/g;
const EDGES = /^-+|-+$/g;

// Frozen copy of the rule: what `sshSlug` does today may drift, a migration must not.
function slugOf(name: string): string | null {
  const slug = name
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
 * Before this revision a server answered to its name made fit for a `Host`
 * line, drawn on every write; from here the word is the reader's own, kept on
 * the entry. Each server gets what it answered to then: its name, unless an
 * earlier server, an identifier or a system alias already held it.
 */
function sshNameFromName(document: JsonObject): JsonObject {
  if (!Array.isArray(document.servers)) {
    return document;
  }

  const servers = document.servers.filter(
    (server): server is JsonObject =>
      typeof server === "object" && server !== null
  );
  const taken = new Set<string>();

  for (const server of servers) {
    taken.add(
      server.origin === "system" ? String(server.host) : `pupitre-${server.id}`
    );

    if (typeof server.slug === "string") {
      taken.add(server.slug);
    }
  }

  return {
    ...document,
    servers: servers.map((server) => {
      if (server.origin === "system" || typeof server.slug === "string") {
        return server;
      }

      const slug = typeof server.name === "string" ? slugOf(server.name) : null;

      if (!slug || taken.has(slug)) {
        return server;
      }

      taken.add(slug);

      return { ...server, slug };
    }),
  };
}
