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

export type JsonObject = Record<string, unknown>;

export interface StoreMigration {
  /** A counter fixed for good, never a version number: it is what the file remembers. */
  id: number;
  slug: string;
  /** Plain JSON in and out, idempotent: decoding into today's type would drop the fields it carries over. */
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

/** A file from a newer version is returned untouched: today's migrations cannot repair tomorrow's shape. */
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

export interface StoreIo {
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

/** Written aside and renamed over: a crash leaves the previous file or the new one, never a truncated one. */
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

/** Never overwritten: a batch replayed on a repaired file must not erase what a rollback would go back to. */
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
  readonly version: number;
  read: () => VersionedRead;
  /** Written by a newer version of the app: read, never written, so a rollback finds it whole. */
  frozen: () => boolean;
  write: (document: JsonObject) => boolean;
  corruptPath: () => string;
}

export interface VersionedFileOptions {
  path: string;
  migrations: readonly StoreMigration[];
  /** The revision the file was stamped with before its first migration. */
  baseline?: number;
  valid?: (document: JsonObject) => boolean;
  modes?: FileModes;
  io?: StoreIo;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

/** A sign-out that left an older copy of the account record behind would keep what the reader asked to erase. */
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
    // No folder, no copy.
  }
}
