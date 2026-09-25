import type { StoreMigration } from "./store-migrations";

/** The revision stamped on the file's first write; see docs/contracts/config-migrations.md. */
export const TRANSFERS_BASELINE = 1;

export const TRANSFERS_MIGRATIONS: readonly StoreMigration[] = [];
