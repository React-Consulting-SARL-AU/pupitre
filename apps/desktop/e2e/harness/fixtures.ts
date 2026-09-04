import type { CommandName } from "@pupitre/shared/agent-protocol";
import {
  PROCESSES,
  SNAPSHOT,
} from "../../src/renderer/src/__tests__/snapshot-fixtures";
import type { ServersConfig } from "../../src/shared/servers";

// TEST-NET-1 is never routed: a channel that escapes the harness reaches
// nothing rather than someone.
export const SERVERS: ServersConfig = {
  active: "e2e-atelier",
  servers: [
    {
      host: "192.0.2.10",
      hostFingerprint: "SHA256:pupitre-e2e",
      id: "e2e-atelier",
      keyPath: "/dev/null",
      name: "atelier",
      origin: "app",
      port: 22,
      user: "dev",
    },
  ],
  version: 1,
};

// The snapshot the screen tests already render from: a capture and a unit test
// disagree about the interface, never about the data.
export const ANSWERS: Partial<Record<CommandName, unknown>> = {
  "processes.list": { processes: PROCESSES },
  snapshot: SNAPSHOT,
};
