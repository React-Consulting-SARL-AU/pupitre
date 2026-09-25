import { FORWARDS_BASELINE, FORWARDS_MIGRATIONS } from "./forwards-migrations";
import {
  type JsonObject,
  type VersionedFile,
  versionedFile,
} from "./store-migrations";

const MAX_PORT = 65_535;

/** A database client saves `127.0.0.1:<port>`: a forward reopened on another port would break it. */
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

function forwardsFile(path: string): VersionedFile {
  return versionedFile({
    baseline: FORWARDS_BASELINE,
    migrations: FORWARDS_MIGRATIONS,
    path,
  });
}

function portsIn(file: VersionedFile): Ports {
  const held = file.read();

  return held.status === "read" ? portsOf(held.document) : {};
}

export function readForwardMemory(path: string): { ports: Ports } {
  return { ports: portsIn(forwardsFile(path)) };
}

export function forwardMemory(path: string): ForwardMemory {
  const file = forwardsFile(path);
  const ports = portsIn(file);

  function save(): void {
    file.write({ ports });
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
