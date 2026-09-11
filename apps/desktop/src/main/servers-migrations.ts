import type { StoreMigration } from "./store-migrations";

/**
 * The ledger of `servers.json`.
 *
 * It starts at 3, the revision the file was already stamped with when the app
 * became the owner of the connection: a server carries its address, its port,
 * its account and its key rather than pointing at a block of the system
 * configuration. Anything below 3 is completed by `normalise`, as it always
 * was, and nothing is gained by writing after the fact the two shapes that
 * became today's.
 *
 * Adding an entry is the whole of what a shape change costs from here on — see
 * docs/contracts/config-migrations.md.
 */
export const SERVERS_BASELINE = 3;

export const SERVERS_MIGRATIONS: readonly StoreMigration[] = [];
