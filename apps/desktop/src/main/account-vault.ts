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
  type JsonObject,
  keepCopy,
  migrate,
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

  function remember(record: AccountRecord): void {
    ensureDir(dir);
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, {
      mode: FILE_MODE,
    });
    chmodSync(recordPath, FILE_MODE);
  }

  /**
   * A record written by an older version of the app goes back to disk in
   * today's shape, once. Completing it in memory on every launch would mean
   * that the day a default changed, every record already written changed
   * with it.
   */
  function record(): AccountRecord {
    try {
      const raw = JSON.parse(readFileSync(recordPath, "utf8")) as JsonObject;
      const migrated = migrate(raw, ACCOUNT_MIGRATIONS);
      const held = { ...EMPTY_RECORD, ...migrated.document } as AccountRecord;

      if (migrated.applied.length > 0) {
        keepCopy(recordPath, 0);
        remember(held);
      }

      return held;
    } catch {
      return EMPTY_RECORD;
    }
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
      rmSync(tokenPath, { force: true });
      rmSync(recordPath, { force: true });
      forgetCopies(recordPath);
    },
  };
}
