import type { JsonObject, StoreMigration } from "./store-migrations";

export const PREFERENCES_BASELINE = 1;

export const PREFERENCES_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: launchAtLoginDefault,
    id: 2,
    slug: "launch-at-login-default",
  },
];

function launchAtLoginDefault(document: JsonObject): JsonObject {
  return typeof document.launchAtLogin === "boolean"
    ? document
    : { ...document, launchAtLogin: false };
}
