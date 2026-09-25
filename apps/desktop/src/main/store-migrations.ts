import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/** Where a file's bytes come from and go to: the disk, or a test's map. */
export interface StoreIo {
  /** The text, or `null` when there is no such file. */
  read: (path: string) => string | null;
  write: (path: string, text: string) => void;
}

export interface FileModes {
  file?: number;
  dir?: number;
}

function missing(failure: unknown): boolean {
  return (failure as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/**
 * Written aside and renamed over: a crash in the middle leaves either the
 * previous file or the new one, never a truncated one.
 */
export function writeAtomically(
  path: string,
  text: string,
  modes: FileModes = {}
): void {
  const dir = dirname(path);
  const staging = `${path}.tmp`;

  mkdirSync(dir, {
    recursive: true,
    ...(modes.dir ? { mode: modes.dir } : {}),
  });

  if (modes.dir) {
    chmodSync(dir, modes.dir);
  }

  writeFileSync(staging, text, {
    encoding: "utf8",
    ...(modes.file ? { mode: modes.file } : {}),
  });

  if (modes.file) {
    chmodSync(staging, modes.file);
  }

  renameSync(staging, path);
}

export function diskIo(modes: FileModes = {}): StoreIo {
  return {
    read: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch (failure) {
        if (missing(failure)) {
          return null;
        }

        throw failure;
      }
    },
    write: (path, text) => writeAtomically(path, text, modes),
  };
}

/**
 * The file as it was, kept beside itself under the revision it held.
 *
 * One copy per revision, never overwritten: the first migration away from a
 * shape is the one worth keeping, and a batch replayed on a repaired file must
 * not erase what the reader would go back to.
 */
export function keepCopy(
  path: string,
  revision: number,
  io: StoreIo = diskIo()
): string | null {
  const copy = `${path}.r${revision}`;

  if (io.read(copy) !== null) {
    return copy;
  }

  const text = io.read(path);

  if (text === null) {
    return null;
  }

  io.write(copy, text);

  return copy;
}

export type VersionedRead =
  | { status: "absent" }
  | { status: "corrupt"; copy: string }
  | {
      status: "read";
      document: JsonObject;
      revision: number;
      /** Migrations ran: the caller writes the document back, once. */
      migrated: boolean;
    };

export interface VersionedFile {
  readonly path: string;
  /** The revision this code writes. */
  readonly version: number;
  read: () => VersionedRead;
  /** Written by a newer version of the app: read, never written. */
  frozen: () => boolean;
  /** Stamped and written whole; `false` when the file is frozen. */
  write: (document: JsonObject) => boolean;
  corruptPath: () => string;
}

export interface VersionedFileOptions {
  path: string;
  migrations: readonly StoreMigration[];
  /** The revision the file was stamped with before its first migration. */
  baseline?: number;
  /** A document of the right revision that still is not this file's shape. */
  valid?: (document: JsonObject) => boolean;
  modes?: FileModes;
  io?: StoreIo;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One file the app keeps, with its ledger around it.
 *
 * Reading migrates and keeps the previous shape beside the file; a file that
 * does not parse is copied to `<file>.corrupt` before anything can write over
 * it; a file stamped by a newer version is frozen, so the version that reads it
 * finds it as it left it after a rollback.
 */
export function versionedFile(options: VersionedFileOptions): VersionedFile {
  const { path, migrations } = options;
  const io = options.io ?? diskIo(options.modes);
  const version = Math.max(options.baseline ?? 0, expectedRevision(migrations));
  const corruptPath = () => `${path}.corrupt`;

  let loaded = false;
  let frozen = false;

  function corrupt(text: string): VersionedRead {
    io.write(corruptPath(), text);

    return { copy: corruptPath(), status: "corrupt" };
  }

  function read(): VersionedRead {
    loaded = true;
    frozen = false;

    const text = io.read(path);

    if (text === null) {
      return { status: "absent" };
    }

    let raw: unknown;

    try {
      raw = JSON.parse(text);
    } catch (failure) {
      if (failure instanceof SyntaxError) {
        return corrupt(text);
      }

      throw failure;
    }

    if (!isObject(raw) || (options.valid && !options.valid(raw))) {
      return corrupt(text);
    }

    const from = revisionOf(raw);
    const migrated = migrate(raw, migrations);

    frozen = migrated.revision > version;

    if (migrated.applied.length > 0) {
      keepCopy(path, from, io);
    }

    return {
      document: migrated.document,
      migrated: migrated.applied.length > 0,
      revision: migrated.revision,
      status: "read",
    };
  }

  return {
    corruptPath,
    frozen: () => frozen,
    path,
    read,
    version,

    write(document) {
      if (!loaded) {
        read();
      }

      if (frozen) {
        return false;
      }

      const { [REVISION_KEY]: _held, ...rest } = document;

      io.write(
        path,
        `${JSON.stringify({ [REVISION_KEY]: version, ...rest }, null, 2)}\n`
      );

      return true;
    },
  };
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
