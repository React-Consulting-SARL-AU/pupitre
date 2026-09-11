import type { JsonObject, StoreMigration } from "./store-migrations";

/**
 * The ledger of `account.json`.
 *
 * Adding an entry is the whole of what a shape change costs — see
 * docs/contracts/config-migrations.md.
 */
export const ACCOUNT_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: listedOrganizations,
    id: 1,
    slug: "organizations-listed",
  },
  {
    apply: carriedSubscription,
    id: 2,
    slug: "subscription-carried",
  },
];

/** A record written before the organizations were read back carries none. */
function listedOrganizations(document: JsonObject): JsonObject {
  const identity = document.identity;

  if (!identity || typeof identity !== "object") {
    return document;
  }

  const held = identity as JsonObject;

  return Array.isArray(held.organizations)
    ? document
    : { ...document, identity: { ...held, organizations: [] } };
}

/** A record written before the subscription was read back holds none. */
function carriedSubscription(document: JsonObject): JsonObject {
  const identity = document.identity;

  if (!identity || typeof identity !== "object") {
    return document;
  }

  const held = identity as JsonObject;

  return "subscription" in held
    ? document
    : { ...document, identity: { ...held, subscription: null } };
}
