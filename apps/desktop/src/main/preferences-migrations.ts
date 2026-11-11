import type { JsonObject, StoreMigration } from "./store-migrations";

export const PREFERENCES_BASELINE = 1;

export const PREFERENCES_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: launchAtLoginDefault,
    id: 2,
    slug: "launch-at-login-default",
  },
  {
    apply: localAgentsDefault,
    id: 3,
    slug: "local-agents-default",
  },
  {
    apply: localAgentsUnattendedDefault,
    id: 4,
    slug: "local-agents-unattended-default",
  },
];

function launchAtLoginDefault(document: JsonObject): JsonObject {
  return typeof document.launchAtLogin === "boolean"
    ? document
    : { ...document, launchAtLogin: false };
}

function localAgentsDefault(document: JsonObject): JsonObject {
  return typeof document.localAgents === "boolean"
    ? document
    : { ...document, localAgents: false };
}

function localAgentsUnattendedDefault(document: JsonObject): JsonObject {
  return typeof document.localAgentsUnattended === "boolean"
    ? document
    : { ...document, localAgentsUnattended: false };
}
