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

  return {
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

    record() {
      try {
        return {
          ...EMPTY_RECORD,
          ...(JSON.parse(readFileSync(recordPath, "utf8")) as AccountRecord),
        };
      } catch {
        return EMPTY_RECORD;
      }
    },

    remember(value) {
      ensureDir(dir);
      writeFileSync(recordPath, `${JSON.stringify(value, null, 2)}\n`, {
        mode: FILE_MODE,
      });
      chmodSync(recordPath, FILE_MODE);
    },

    clear() {
      held = null;
      rmSync(tokenPath, { force: true });
      rmSync(recordPath, { force: true });
    },
  };
}
