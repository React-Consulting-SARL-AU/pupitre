import type { StoreMigration } from "./store-migrations";

/**
 * The ledger of `forwards.json`, the local port each forward last took.
 *
 * It starts at 1, the revision the file is stamped with from its first write:
 * one entry per server and remote port, holding the local port the app bound
 * for it. Adding an entry is the whole of what a shape change costs — see
 * docs/contracts/config-migrations.md.
 */
export const FORWARDS_BASELINE = 1;

export const FORWARDS_MIGRATIONS: readonly StoreMigration[] = [];
