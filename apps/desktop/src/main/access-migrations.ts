import type { StoreMigration } from "./store-migrations";

/** Every shape change of `access/<server>.json` adds an entry: see docs/contracts/config-migrations.md. */
export const ACCESS_MIGRATIONS: readonly StoreMigration[] = [];
