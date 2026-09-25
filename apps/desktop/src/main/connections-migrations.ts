import type { JsonObject, StoreMigration } from "./store-migrations";

/**
 * The ledger of `connections/<provider>.json`, what a connection keeps beside
 * its token: the account it names and its settings.
 *
 * Adding an entry is the whole of what a shape change costs — see
 * docs/contracts/config-migrations.md.
 */
export const CONNECTIONS_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: accountNamed,
    id: 1,
    slug: "account-id-name",
  },
];

/**
 * Cloudflare wrote `accountId` and `accountName` before there was a second
 * connection; every connection names its account `id` and `name` since.
 */
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
