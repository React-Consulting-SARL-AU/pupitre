import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * The app's own configuration, brought to the shape this version reads.
 *
 * The same ledger the agent keeps for /etc/pupitre, on the files the app writes
 * in its data folder. The app updates itself too, and a reader who came back
 * after three releases has a `servers.json` written by the version they left.
 * Reading it as if it were today's shape is how a list of servers turns into an
 * empty screen.
 *
 * The rules are the agent's, and for the same reasons:
 *
 * - The revision is a counter, never a version number. Shapes change far less
 *   often than the app ships.
 * - An identifier is fixed for good: it is what the file remembers.
 * - A migration takes plain JSON and returns plain JSON. Decoding into a type
 *   from today's code would drop, on the way through, every field that type no
 *   longer names — which is what the migration exists to carry over.
 * - A migration is idempotent, and a no-op on what it does not recognise.
 * - The file it changes is copied first, once per batch: a reader who has to go
 *   back to the previous version of the app finds their servers there.
 */

export type JsonObject = Record<string, unknown>;

export interface StoreMigration {
  id: number;
  slug: string;
  apply: (document: JsonObject) => JsonObject;
}

export interface Migrated {
  document: JsonObject;
  revision: number;
  applied: readonly number[];
}

export const REVISION_KEY = "version";

export function expectedRevision(
  migrations: readonly StoreMigration[]
): number {
  return migrations.reduce((highest, one) => Math.max(highest, one.id), 0);
}

function revisionOf(document: JsonObject): number {
  const held = document[REVISION_KEY];

  return typeof held === "number" && Number.isInteger(held) && held >= 0
    ? held
    : 0;
}

/**
 * A file written by a newer version of the app is left exactly as it is.
 *
 * Running today's migrations over tomorrow's shape would not repair it, and
 * rewriting it would take from the reader the version that does read it. The
 * caller sees a revision it did not ask for and says so.
 */
export function migrate(
  document: JsonObject,
  migrations: readonly StoreMigration[]
): Migrated {
  const from = revisionOf(document);
  const expected = expectedRevision(migrations);

  if (from >= expected) {
    return { applied: [], document, revision: from };
  }

  const applied: number[] = [];
  let carried = document;

  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (migration.id <= from) {
      continue;
    }

    carried = migration.apply(carried);
    applied.push(migration.id);
  }

  return {
    applied,
    document: { ...carried, [REVISION_KEY]: expected },
    revision: expected,
  };
}

/**
 * The file as it was, kept beside itself under the revision it held.
 *
 * One copy per revision, never overwritten: the first migration away from a
 * shape is the one worth keeping, and a batch replayed on a repaired file must
 * not erase what the reader would go back to.
 */
export function keepCopy(path: string, revision: number): string | null {
  const copy = `${path}.r${revision}`;

  if (!existsSync(path) || existsSync(copy)) {
    return existsSync(copy) ? copy : null;
  }

  copyFileSync(path, copy);

  return copy;
}

/**
 * The copies go when the file goes. A sign-out that left the previous shape of
 * an account record beside itself would keep on disk exactly what the reader
 * asked to be rid of.
 */
export function forgetCopies(path: string): void {
  const dir = dirname(path);
  const prefix = `${basename(path)}.r`;

  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(prefix)) {
        rmSync(join(dir, name), { force: true });
      }
    }
  } catch {
    // The folder is not there, so neither is any copy of anything.
  }
}
