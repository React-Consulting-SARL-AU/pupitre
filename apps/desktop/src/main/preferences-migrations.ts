import type { JsonObject, StoreMigration } from "./store-migrations";

/**
 * The ledger of `preferences.json`, what the main process itself reads.
 *
 * It starts at 1, the revision the file is stamped with from its first write:
 * whether a session that waits may say so outside the window. Adding an entry
 * is the whole of what a shape change costs — see
 * docs/contracts/config-migrations.md.
 */
export const PREFERENCES_BASELINE = 1;

export const PREFERENCES_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: launchAtLoginDefault,
    id: 2,
    slug: "launch-at-login-default",
  },
];

/** A file written before the app could open at login says it does not. */
function launchAtLoginDefault(document: JsonObject): JsonObject {
  return typeof document.launchAtLogin === "boolean"
    ? document
    : { ...document, launchAtLogin: false };
}
