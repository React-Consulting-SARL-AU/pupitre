import type { JsonObject, StoreMigration } from "./store-migrations";

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
  {
    apply: licenseRenamed,
    id: 3,
    slug: "license-renamed",
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

function serversOf(subscription: unknown): unknown {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  return (subscription as JsonObject).servers ?? null;
}

/** The subscription's seats meant a trial or the launch, which no licence grant carries: the next `/me` says what holds. */
function licenseRenamed(document: JsonObject): JsonObject {
  const identity = document.identity;

  if (!identity || typeof identity !== "object") {
    return document;
  }

  const { entitlement, subscription, ...held } = identity as JsonObject;

  return {
    ...document,
    identity: {
      ...held,
      license: held.license ?? entitlement ?? "none",
      licenseGrant: held.licenseGrant ?? null,
      servers: held.servers ?? serversOf(subscription),
    },
  };
}
