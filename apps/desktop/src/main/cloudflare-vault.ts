import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CloudflareConnection } from "@shared/cloudflare";
import type { Sealer } from "./account-vault";

/**
 * The client's Cloudflare account, and nothing of their servers.
 *
 * The token goes through the system keychain and only its ciphertext touches
 * the disk, like the platform's. A tunnel is not kept here: the server that
 * runs it holds its identifier, the app reads it back with `module.config`, and
 * a laptop that is reinstalled therefore finds the tunnels of its servers again
 * with nothing but this token.
 */

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

const TOKEN_FILE = "cloudflare.token";
const RECORD_FILE = "cloudflare.json";

export interface CloudflareRecord {
  connection: CloudflareConnection | null;
}

export const EMPTY_RECORD: CloudflareRecord = { connection: null };

export interface CloudflareVault {
  sealed: () => boolean;
  token: () => string | null;
  connection: () => CloudflareConnection | null;
  connect: (token: string, connection: CloudflareConnection) => void;
  clear: () => void;
}

/**
 * A record is a connection only when it names the account: an earlier shape of
 * the app kept a zone here and no name, and everything above reads a connected
 * account as one it can name.
 */
function readConnection(value: unknown): CloudflareConnection | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { accountId, accountName } = value as Partial<CloudflareConnection>;

  return accountId && accountName ? { accountId, accountName } : null;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { mode: DIR_MODE, recursive: true });
  chmodSync(dir, DIR_MODE);
}

export function createCloudflareVault({
  dir,
  sealer,
}: {
  dir: string;
  sealer: Sealer;
}): CloudflareVault {
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

  function record(): CloudflareRecord {
    try {
      const held = JSON.parse(readFileSync(recordPath, "utf8")) as {
        connection?: unknown;
      };

      return { connection: readConnection(held.connection) };
    } catch {
      return EMPTY_RECORD;
    }
  }

  return {
    sealed,
    token,

    connection() {
      return record().connection;
    },

    connect(value, connection) {
      held = value;

      if (sealed()) {
        ensureDir(dir);
        writeFileSync(tokenPath, sealer.encrypt(value), { mode: FILE_MODE });
        chmodSync(tokenPath, FILE_MODE);
      }

      ensureDir(dir);
      writeFileSync(
        recordPath,
        `${JSON.stringify({ connection }, null, 2)}\n`,
        {
          mode: FILE_MODE,
        }
      );
      chmodSync(recordPath, FILE_MODE);
    },

    clear() {
      held = null;
      rmSync(tokenPath, { force: true });
      rmSync(recordPath, { force: true });
    },
  };
}
