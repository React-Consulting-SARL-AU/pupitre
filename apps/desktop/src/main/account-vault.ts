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
  /** Without a keychain the token lives for the run only, never in a readable file. */
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
  // A newer version's file refuses this write: held for the run rather than written over it.
  let unsaved: AccountRecord | null = null;

  function remember(record: AccountRecord): void {
    if (!file.write({ ...record })) {
      unsaved = record;
    }
  }

  /** Migrated records are written back once: filling defaults in memory would shift them when a default changes. */
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
