import type { StoreMigration } from "./store-migrations";

/**
 * The ledger of `transfers.json`, the transfers a launch left unfinished.
 *
 * It starts at 1, the revision the file is stamped with from its first write:
 * a transfer carries its direction, its two paths, its server, the tool it
 * rides on and the bytes already across. Adding an entry is the whole of what
 * a shape change costs — see docs/contracts/config-migrations.md.
 */
export const TRANSFERS_BASELINE = 1;

export const TRANSFERS_MIGRATIONS: readonly StoreMigration[] = [];
