import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AccountDevice, AccountIdentity } from "@shared/account";
import { ACCOUNT_MIGRATIONS } from "./account-migrations";
import {
  forgetCopies,
  type VersionedFile,
  versionedFile,
} from "./store-migrations";

/**
 * The session token, and the little that is not one.
 *
 * The token goes through the operating system's keychain — `safeStorage` — and
 * only its ciphertext ever reaches the disk. A computer whose keychain refuses
 * to open keeps the token for the length of the run and says so, rather than
 * falling back to a readable file.
 */

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

const TOKEN_FILE = "account.token";
const RECORD_FILE = "account.json";

export interface Sealer {
  available: () => boolean;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
}

export interface AccountRecord {
  identity: AccountIdentity | null;
  device: AccountDevice | null;
  checkedAt: string | null;
}

export const EMPTY_RECORD: AccountRecord = {
  checkedAt: null,
  device: null,
  identity: null,
};

export interface TokenVault {
  sealed: () => boolean;
  token: () => string | null;
  keep: (token: string) => void;
  record: () => AccountRecord;
  remember: (record: AccountRecord) => void;
  clear: () => void;
}

function recordFile(path: string): VersionedFile {
  return versionedFile({
    migrations: ACCOUNT_MIGRATIONS,
    modes: { dir: DIR_MODE, file: FILE_MODE },
    path,
  });
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { mode: DIR_MODE, recursive: true });
  chmodSync(dir, DIR_MODE);
}

export function createTokenVault({
  dir,
  sealer,
}: {
  dir: string;
  sealer: Sealer;
}): TokenVault {
  const tokenPath = join(dir, TOKEN_FILE);
  const recordPath = join(dir, RECORD_FILE);

  let held: string | null = null;

  function sealed(): boolean {
    return sealer.available();
  }

  function token(): string | null {
    if (held) {
      return held;
    }

    if (!(sealed() && existsSync(tokenPath))) {
      return null;
    }

    try {
      held = sealer.decrypt(readFileSync(tokenPath));

      return held;
    } catch {
      rmSync(tokenPath, { force: true });

      return null;
    }
  }

  let file = recordFile(recordPath);
  /** What a newer version's file could not take: held for the run, never written over it. */
  let unsaved: AccountRecord | null = null;

  function remember(record: AccountRecord): void {
    if (!file.write({ ...record })) {
      unsaved = record;
    }
  }

  /**
   * A record written by an older version of the app goes back to disk in
   * today's shape, once. Completing it in memory on every launch would mean
   * that the day a default changed, every record already written changed
   * with it. One that does not parse is kept aside as `account.json.corrupt`.
   */
  function record(): AccountRecord {
    if (unsaved) {
      return unsaved;
    }

    const held = file.read();

    if (held.status !== "read") {
      return EMPTY_RECORD;
    }

    const kept = { ...EMPTY_RECORD, ...held.document } as AccountRecord;

    if (held.migrated) {
      file.write({ ...kept });
    }

    return kept;
  }

  return {
    record,
    remember,
    sealed,
    token,

    keep(value) {
      held = value;

      if (!sealed()) {
        return;
      }

      ensureDir(dir);
      writeFileSync(tokenPath, sealer.encrypt(value), { mode: FILE_MODE });
      chmodSync(tokenPath, FILE_MODE);
    },

    clear() {
      held = null;
      unsaved = null;
      rmSync(tokenPath, { force: true });
      rmSync(recordPath, { force: true });
      rmSync(file.corruptPath(), { force: true });
      forgetCopies(recordPath);
      file = recordFile(recordPath);
    },
  };
}
