import { FORWARDS_BASELINE, FORWARDS_MIGRATIONS } from "./forwards-migrations";
import {
  type JsonObject,
  type VersionedFile,
  versionedFile,
} from "./store-migrations";

const MAX_PORT = 65_535;

/** A forward opened again at every start and after every drop, until closed by hand. */
export interface KeptForward {
  serverId: string;
  remotePort: number;
  localPort: number;
  label: string;
}

/** A database client saves `127.0.0.1:<port>`: a forward reopened on another port would break it. */
export interface ForwardMemory {
  recall: (serverId: string, remotePort: number) => number | null;
  remember: (serverId: string, remotePort: number, localPort: number) => void;
  forget: (serverId: string) => void;
  kept: () => KeptForward[];
  keep: (forward: KeptForward) => void;
  release: (serverId: string, remotePort: number) => void;
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

function isKept(value: unknown): value is KeptForward {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return (
    typeof entry.serverId === "string" &&
    typeof entry.label === "string" &&
    isPort(entry.remotePort) &&
    isPort(entry.localPort)
  );
}

function keptOf(document: JsonObject): KeptForward[] {
  return Array.isArray(document.kept)
    ? document.kept.filter(isKept).map((entry) => ({
        label: entry.label,
        localPort: entry.localPort,
        remotePort: entry.remotePort,
        serverId: entry.serverId,
      }))
    : [];
}

function forwardsFile(path: string): VersionedFile {
  return versionedFile({
    baseline: FORWARDS_BASELINE,
    migrations: FORWARDS_MIGRATIONS,
    path,
  });
}

function documentIn(file: VersionedFile): JsonObject {
  const held = file.read();

  return held.status === "read" ? held.document : {};
}

export function readForwardMemory(path: string): {
  ports: Ports;
  kept: KeptForward[];
} {
  const document = documentIn(forwardsFile(path));

  return { kept: keptOf(document), ports: portsOf(document) };
}

export function forwardMemory(path: string): ForwardMemory {
  const file = forwardsFile(path);
  const document = documentIn(file);
  const ports = portsOf(document);
  let kept = keptOf(document);

  function save(): void {
    file.write({ kept, ports });
  }

  return {
    forget(serverId) {
      if (ports[serverId]) {
        delete ports[serverId];
        save();
      }
    },
    keep(forward) {
      kept = [
        ...kept.filter(
          (entry) =>
            entry.serverId !== forward.serverId ||
            entry.remotePort !== forward.remotePort
        ),
        forward,
      ];

      save();
    },
    kept: () => [...kept],
    recall(serverId, remotePort) {
      return ports[serverId]?.[String(remotePort)] ?? null;
    },
    release(serverId, remotePort) {
      const before = kept.length;

      kept = kept.filter(
        (entry) =>
          entry.serverId !== serverId || entry.remotePort !== remotePort
      );

      if (kept.length !== before) {
        save();
      }
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
