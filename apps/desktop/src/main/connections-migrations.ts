import type { JsonObject, StoreMigration } from "./store-migrations";

/** Every shape change of `connections/<provider>.json` adds an entry: see docs/contracts/config-migrations.md. */
export const CONNECTIONS_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: accountNamed,
    id: 1,
    slug: "account-id-name",
  },
];

/** Cloudflare wrote `accountId`/`accountName` before every connection named its account `id`/`name`. */
function accountNamed(document: JsonObject): JsonObject {
  const connection = document.connection;

  if (typeof connection !== "object" || connection === null) {
    return document;
  }

  const { accountId, accountName, ...rest } = connection as JsonObject;

  if (accountId === undefined && accountName === undefined) {
    return document;
  }

  return {
    ...document,
    connection: {
      ...rest,
      id: rest.id ?? accountId,
      name: rest.name ?? accountName,
    },
  };
}
