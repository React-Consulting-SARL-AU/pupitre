import type { CommandName } from "@pupitre/shared/agent-protocol";
import {
  PROCESSES,
  SNAPSHOT,
} from "../../src/renderer/src/__tests__/snapshot-fixtures";
import type { AccountState } from "../../src/shared/account";
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

/**
 * Someone is signed in on this computer.
 *
 * The app opens on the sign-in as long as nobody is, so every scenario that is
 * not about the account itself starts from an identity the platform confirmed.
 * The specs that do test the account replace these two channels with their own.
 */
export const ACCOUNT: AccountState = {
  build: "production",
  checkedAt: "2026-09-06T09:00:00.000Z",
  consoleUrl: "https://app.pupitre.test/dashboard",
  device: {
    fingerprint: "SHA256:pupitre-e2e",
    id: "device-e2e",
    name: "MacBook",
    publicKey: "ssh-ed25519 AAAA",
  },
  identity: {
    email: "ada@pupitre.studio",
    entitlement: "valid",
    name: "Ada Lovelace",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
    ],
    role: "owner",
  },
  refusal: null,
  sealed: true,
  usage: {
    entitlement: "valid",
    source: "platform",
    status: "granted",
    validUntil: null,
  },
};
