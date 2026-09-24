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

/**
 * The client's third-party accounts, and nothing of their servers.
 *
 * One token per provider, each through the system keychain, only its ciphertext
 * touching the disk, like the platform's. Nothing of a server is kept here: a
 * tunnel is held by the machine that runs it, so a laptop that is reinstalled
 * finds every server of the account again with nothing but these tokens.
 */

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface ConnectionVault {
  sealed: () => boolean;
  token: (kind: ConnectionKind) => string | null;
  account: (kind: ConnectionKind) => ConnectionAccount | null;
  /** What a connection keeps beside its token that is not a secret: a bucket's address, a public key. */
  settings: (kind: ConnectionKind) => Record<string, unknown> | null;
  /** True once a token is held, whether or not the provider could name it. */
  holds: (kind: ConnectionKind) => boolean;
  connect: (
    kind: ConnectionKind,
    token: string,
    account: ConnectionAccount | null,
    settings?: Record<string, unknown>
  ) => void;
  clear: (kind: ConnectionKind) => void;
}

/**
 * Cloudflare wrote `accountId` and `accountName` before there was a second
 * connection. A laptop that connected then keeps its account rather than being
 * asked for the token again.
 */
function readAccount(value: unknown): ConnectionAccount | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const held = value as Partial<
    ConnectionAccount & { accountId: string; accountName: string }
  >;
  const id = held.id ?? held.accountId;
  const name = held.name ?? held.accountName;

  return id && name ? { id, name } : null;
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

  function record(
    kind: ConnectionKind
  ): { connection?: unknown; settings?: unknown } | null {
    try {
      return JSON.parse(readFileSync(recordPath(kind), "utf8")) as {
        connection?: unknown;
        settings?: unknown;
      } | null;
    } catch {
      return null;
    }
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

    /**
     * A record file is written for every connection, named account or not: it
     * is what says a token was given, on a computer whose keychain refuses to
     * hold one.
     */
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

      const path = recordPath(kind);

      writeFileSync(
        path,
        `${JSON.stringify(
          kept ? { connection: named, settings: kept } : { connection: named },
          null,
          2
        )}\n`,
        {
          mode: FILE_MODE,
        }
      );
      chmodSync(path, FILE_MODE);
    },

    clear(kind) {
      held.delete(kind);
      rmSync(tokenPath(kind), { force: true });
      rmSync(recordPath(kind), { force: true });
    },
  };
}
