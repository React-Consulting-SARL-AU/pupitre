import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { FORWARDS_BASELINE, FORWARDS_MIGRATIONS } from "./forwards-migrations";
import {
  expectedRevision,
  type JsonObject,
  keepCopy,
  migrate,
  REVISION_KEY,
} from "./store-migrations";

/**
 * The local port a forward last took, per server and remote port.
 *
 * A database client keeps a saved connection on `127.0.0.1:55001`; a forward
 * that came back on 55002 the next day breaks it for no reason. So the port
 * is written down, and asked for again — when it is still free. The file
 * carries its revision like every file the app keeps.
 */

const MAX_PORT = 65_535;

const VERSION = Math.max(
  FORWARDS_BASELINE,
  expectedRevision(FORWARDS_MIGRATIONS)
);

export interface ForwardMemory {
  recall: (serverId: string, remotePort: number) => number | null;
  remember: (serverId: string, remotePort: number, localPort: number) => void;
  forget: (serverId: string) => void;
}

type Ports = Record<string, Record<string, number>>;

function isPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PORT
  );
}

function portsOf(document: JsonObject): Ports {
  const held = document.ports;
  const ports: Ports = {};

  if (typeof held !== "object" || held === null) {
    return ports;
  }

  for (const [serverId, entries] of Object.entries(held)) {
    if (typeof entries !== "object" || entries === null) {
      continue;
    }

    for (const [remote, local] of Object.entries(entries)) {
      if (isPort(Number(remote)) && isPort(local)) {
        ports[serverId] = { ...ports[serverId], [remote]: local };
      }
    }
  }

  return ports;
}

/** What the file holds, brought to today's shape; nothing on a file we cannot read. */
export function readForwardMemory(path: string): {
  ports: Ports;
  revision: number;
} {
  if (!existsSync(path)) {
    return { ports: {}, revision: VERSION };
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as JsonObject;
    const from = typeof raw[REVISION_KEY] === "number" ? raw[REVISION_KEY] : 0;
    const migrated = migrate(raw, FORWARDS_MIGRATIONS);

    if (migrated.applied.length > 0) {
      keepCopy(path, from);
    }

    return { ports: portsOf(migrated.document), revision: migrated.revision };
  } catch {
    return { ports: {}, revision: VERSION };
  }
}

/**
 * The memory, on disk at `path`.
 *
 * A file written by a newer version of the app is read and never written: the
 * ports it holds are still good, the shape it has is not ours to change.
 */
export function forwardMemory(path: string): ForwardMemory {
  const held = readForwardMemory(path);
  const frozen = held.revision > VERSION;
  const ports = held.ports;

  function save(): void {
    if (frozen) {
      return;
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ [REVISION_KEY]: VERSION, ports }, null, 2)}\n`,
      "utf8"
    );
  }

  return {
    forget(serverId) {
      if (ports[serverId]) {
        delete ports[serverId];
        save();
      }
    },
    recall(serverId, remotePort) {
      return ports[serverId]?.[String(remotePort)] ?? null;
    },
    remember(serverId, remotePort, localPort) {
      if (ports[serverId]?.[String(remotePort)] === localPort) {
        return;
      }

      ports[serverId] = { ...ports[serverId], [String(remotePort)]: localPort };
      save();
    },
  };
}
