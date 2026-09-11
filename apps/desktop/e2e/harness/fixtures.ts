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
/** What the unit answers once systemd has had its say: the state, never the intention. */
function postgres(state: "running" | "stopped") {
  return {
    credentials: {},
    id: "db.postgres",
    name: "PostgreSQL",
    port: 5432,
    state,
    unit: "postgresql.service",
    version: "17.2",
  };
}

export const ANSWERS: Partial<Record<CommandName, unknown>> = {
  "processes.list": { processes: PROCESSES },
  "service.restart": postgres("running"),
  "service.start": postgres("running"),
  "service.stop": postgres("stopped"),
  "project.detect": {
    cmd: "bun run dev --port 3100",
    install: "bun install",
    pkgmgr: "bun",
    port_hint: 3100,
  },
  snapshot: SNAPSHOT,
  "tunnel.sync": {
    installed: true,
    provider: "cloudflare",
    routes: [
      {
        hostname: "atlas-web.example.org",
        project: "atlas-web",
        service: "http://127.0.0.1:3100",
      },
    ],
    state: "running",
  },
};

/** One entry of the fake tree, as `fs.list` describes it. */
export interface FixtureEntry {
  name: string;
  kind: "file" | "dir";
  size_bytes: number;
  modified_at: string;
  mode: string;
}

/**
 * The working tree of the fake server, under the root its completions name.
 *
 * `fs.list` reads a folder here, `fs.stat` and `fs.read` a file: the text is
 * what the editor opens, and what a write replaces. The archive is listed and
 * described but never read — it is the file the app says is to be downloaded.
 */
export const FILES: {
  root: string;
  folders: Record<string, FixtureEntry[]>;
  texts: Record<string, string>;
} = {
  folders: {
    "": [
      {
        kind: "dir",
        mode: "0755",
        modified_at: "2026-09-01T10:00:00Z",
        name: "projects",
        size_bytes: 4096,
      },
      {
        kind: "file",
        mode: "0644",
        modified_at: "2026-08-01T10:00:00Z",
        name: ".bashrc",
        size_bytes: 3771,
      },
    ],
    projects: [
      {
        kind: "dir",
        mode: "0755",
        modified_at: "2026-09-01T10:00:00Z",
        name: "flymate",
        size_bytes: 4096,
      },
    ],
    "projects/flymate": [
      {
        kind: "dir",
        mode: "0755",
        modified_at: "2026-09-02T10:00:00Z",
        name: "src",
        size_bytes: 4096,
      },
      {
        kind: "file",
        mode: "0644",
        modified_at: "2026-09-03T10:00:00Z",
        name: "README.md",
        size_bytes: 41,
      },
      {
        kind: "file",
        mode: "0600",
        modified_at: "2026-09-04T10:00:00Z",
        name: ".env",
        size_bytes: 10,
      },
      {
        kind: "file",
        mode: "0644",
        modified_at: "2026-09-05T10:00:00Z",
        name: "dump.tar.gz",
        size_bytes: 24_000_000,
      },
    ],
    "projects/flymate/src": [
      {
        kind: "file",
        mode: "0644",
        modified_at: "2026-09-06T10:00:00Z",
        name: "index.ts",
        size_bytes: 52,
      },
    ],
  },
  root: "/home/dev/projects",
  texts: {
    ".bashrc": "export PATH=$HOME/.bun/bin:$PATH\n",
    "projects/flymate/.env": "PORT=3000\n",
    "projects/flymate/README.md":
      "# Flymate\n\nThe API behind the booking app.\n",
    "projects/flymate/src/index.ts":
      "export const port = 3000;\nexport const host = 'x';\n",
  },
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
    subscription: null,
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
