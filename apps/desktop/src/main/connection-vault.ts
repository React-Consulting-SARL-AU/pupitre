import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ConnectionAccount, ConnectionKind } from "@shared/connections";
import type { Sealer } from "./account-vault";
import { CONNECTIONS_MIGRATIONS } from "./connections-migrations";
import {
  forgetCopies,
  type JsonObject,
  type VersionedFile,
  versionedFile,
} from "./store-migrations";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface ConnectionVault {
  sealed: () => boolean;
  token: (kind: ConnectionKind) => string | null;
  account: (kind: ConnectionKind) => ConnectionAccount | null;
  /** Non-secret values kept beside the token: a bucket's address, a public key. */
  settings: (kind: ConnectionKind) => Record<string, unknown> | null;
  holds: (kind: ConnectionKind) => boolean;
  connect: (
    kind: ConnectionKind,
    token: string,
    account: ConnectionAccount | null,
    settings?: Record<string, unknown>
  ) => void;
  clear: (kind: ConnectionKind) => void;
}

function readAccount(value: unknown): ConnectionAccount | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { id, name } = value as Partial<ConnectionAccount>;

  return typeof id === "string" && id && typeof name === "string" && name
    ? { id, name }
    : null;
}

function recordFile(path: string): VersionedFile {
  return versionedFile({
    migrations: CONNECTIONS_MIGRATIONS,
    modes: { dir: DIR_MODE, file: FILE_MODE },
    path,
  });
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { mode: DIR_MODE, recursive: true });
  chmodSync(dir, DIR_MODE);
}

export function createConnectionVault({
  dir,
  sealer,
}: {
  dir: string;
  sealer: Sealer;
}): ConnectionVault {
  const held = new Map<ConnectionKind, string>();

  const tokenPath = (kind: ConnectionKind) => join(dir, `${kind}.token`);
  const recordPath = (kind: ConnectionKind) => join(dir, `${kind}.json`);

  function sealed(): boolean {
    return sealer.available();
  }

  function token(kind: ConnectionKind): string | null {
    const kept = held.get(kind);

    if (kept) {
      return kept;
    }

    const path = tokenPath(kind);

    if (!(sealed() && existsSync(path))) {
      return null;
    }

    try {
      const value = sealer.decrypt(readFileSync(path));

      held.set(kind, value);

      return value;
    } catch {
      rmSync(path, { force: true });

      return null;
    }
  }

  function record(kind: ConnectionKind): JsonObject | null {
    const file = recordFile(recordPath(kind));
    const held = file.read();

    if (held.status !== "read") {
      return null;
    }

    if (held.migrated) {
      file.write(held.document);
    }

    return held.document;
  }

  function account(kind: ConnectionKind): ConnectionAccount | null {
    return readAccount(record(kind)?.connection ?? null);
  }

  function settings(kind: ConnectionKind): Record<string, unknown> | null {
    const held = record(kind)?.settings;

    return typeof held === "object" && held !== null
      ? (held as Record<string, unknown>)
      : null;
  }

  return {
    account,
    sealed,
    settings,
    token,

    // The record, not the token file, says a token was given: a refusing keychain keeps no token file.
    holds(kind) {
      return existsSync(recordPath(kind));
    },

    connect(kind, value, named, kept) {
      held.set(kind, value);
      ensureDir(dir);

      if (sealed()) {
        const path = tokenPath(kind);

        writeFileSync(path, sealer.encrypt(value), { mode: FILE_MODE });
        chmodSync(path, FILE_MODE);
      }

      recordFile(recordPath(kind)).write(
        kept ? { connection: named, settings: kept } : { connection: named }
      );
    },

    clear(kind) {
      held.delete(kind);
      rmSync(tokenPath(kind), { force: true });
      rmSync(recordPath(kind), { force: true });
      rmSync(`${recordPath(kind)}.corrupt`, { force: true });
      forgetCopies(recordPath(kind));
    },
  };
}
