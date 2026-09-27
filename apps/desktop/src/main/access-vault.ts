import { rmSync } from "node:fs";
import { join } from "node:path";
import { ACCESS_MIGRATIONS } from "./access-migrations";
import type { Sealer } from "./account-vault";
import {
  forgetCopies,
  type JsonObject,
  type VersionedFile,
  versionedFile,
} from "./store-migrations";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** The keys this computer created on a server, sealed by the keychain; the server holds their hashes only. */
export interface AccessVault {
  key: (serverId: string, id: string) => string | null;
  held: (serverId: string) => string[];
  deviceKey: (serverId: string) => string | null;
  keep: (serverId: string, id: string, key: string, device: boolean) => void;
  forget: (serverId: string, id: string) => void;
  /** Drops what the server no longer lists: a key revoked from another computer. */
  keepOnly: (serverId: string, listed: readonly string[]) => void;
  clear: (serverId: string) => void;
}

interface ServerKeys {
  device: string | null;
  keys: Map<string, string>;
}

const SERVER_FILE = /^[A-Za-z0-9_-]{1,64}$/;

export function createAccessVault({
  dir,
  sealer,
}: {
  dir: string;
  sealer: Sealer;
}): AccessVault {
  // Without a keychain the keys last until quit, as the connection tokens do.
  const held = new Map<string, ServerKeys>();

  function file(serverId: string): VersionedFile | null {
    if (!SERVER_FILE.test(serverId)) {
      return null;
    }

    return versionedFile({
      migrations: ACCESS_MIGRATIONS,
      modes: { dir: DIR_MODE, file: FILE_MODE },
      path: join(dir, `${serverId}.json`),
    });
  }

  function unsealed(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    try {
      return sealer.decrypt(Buffer.from(value, "base64"));
    } catch {
      return null;
    }
  }

  function read(serverId: string): ServerKeys {
    const record: ServerKeys = { device: null, keys: new Map() };
    const stored = sealer.available() ? file(serverId)?.read() : undefined;

    if (stored?.status !== "read") {
      return record;
    }

    const { device, keys } = stored.document;

    if (typeof keys === "object" && keys !== null) {
      for (const [id, sealed] of Object.entries(keys)) {
        const key = unsealed(sealed);

        if (key) {
          record.keys.set(id, key);
        }
      }
    }

    record.device =
      typeof device === "string" && record.keys.has(device) ? device : null;

    return record;
  }

  function load(serverId: string): ServerKeys {
    const record = held.get(serverId) ?? read(serverId);

    held.set(serverId, record);

    return record;
  }

  function save(serverId: string, record: ServerKeys): void {
    held.set(serverId, record);

    if (!sealer.available()) {
      return;
    }

    const keys: JsonObject = {};

    for (const [id, key] of record.keys) {
      keys[id] = sealer.encrypt(key).toString("base64");
    }

    file(serverId)?.write({ device: record.device, keys });
  }

  return {
    clear(serverId) {
      held.delete(serverId);

      const path = file(serverId)?.path;

      if (path) {
        rmSync(path, { force: true });
        rmSync(`${path}.corrupt`, { force: true });
        forgetCopies(path);
      }
    },

    deviceKey(serverId) {
      const record = load(serverId);

      return record.device ? (record.keys.get(record.device) ?? null) : null;
    },

    forget(serverId, id) {
      const record = load(serverId);

      record.keys.delete(id);

      if (record.device === id) {
        record.device = null;
      }

      save(serverId, record);
    },

    held(serverId) {
      return [...load(serverId).keys.keys()];
    },

    keep(serverId, id, key, device) {
      const record = load(serverId);

      record.keys.set(id, key);

      if (device) {
        record.device = id;
      }

      save(serverId, record);
    },

    keepOnly(serverId, listed) {
      const record = load(serverId);
      const gone = [...record.keys.keys()].filter((id) => !listed.includes(id));

      if (gone.length === 0) {
        return;
      }

      for (const id of gone) {
        record.keys.delete(id);
      }

      if (record.device && !record.keys.has(record.device)) {
        record.device = null;
      }

      save(serverId, record);
    },

    key(serverId, id) {
      return load(serverId).keys.get(id) ?? null;
    },
  };
}
