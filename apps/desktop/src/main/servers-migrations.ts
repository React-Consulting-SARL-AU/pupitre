import type { JsonObject, StoreMigration } from "./store-migrations";

/** 3 was already stamped when the ledger began; anything below is completed by `normalise`. */
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

/** Each server keeps the SSH name it answered to before: its name, unless something earlier already held it. */
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
