import type { CommandName } from "@pupitre/shared/agent-protocol";
import {
  PROCESSES,
  SNAPSHOT,
} from "../../src/renderer/src/__tests__/snapshot-fixtures";
import type { AccountState } from "../../src/shared/account";
import type { ServersConfig } from "../../src/shared/servers";

// TEST-NET-1 is never routed: a channel escaping the harness reaches nothing.
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
  "access.list": {
    keys: [
      {
        created_at: "2026-09-20T09:12:00Z",
        id: "e2edevice001",
        name: "atelier",
        projects: null,
      },
      {
        created_at: "2026-09-24T16:40:00Z",
        id: "e2ereview001",
        name: "Recette client",
        projects: ["flyleaf-api"],
      },
    ],
  },
  "processes.list": { processes: PROCESSES },
  "service.restart": postgres("running"),
  "service.start": postgres("running"),
  "service.stop": postgres("stopped"),
  "project.detect": {
    processes: [
      {
        cmd: "bun run dev --port 3100",
        dir: ".",
        id: "atlas-web",
        install: "bun install",
        pkgmgr: "bun",
        port_hint: 3100,
      },
    ],
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

export interface FixtureEntry {
  name: string;
  kind: "file" | "dir";
  size_bytes: number;
  modified_at: string;
  mode: string;
}

/** `dump.tar.gz` has no text on purpose: it is the file the app offers to download. */
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
        name: "flyleaf",
        size_bytes: 4096,
      },
    ],
    "projects/flyleaf": [
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
      {
        kind: "file",
        mode: "0644",
        modified_at: "2026-09-05T11:00:00Z",
        name: "logo.svg",
        size_bytes: 118,
      },
    ],
    "projects/flyleaf/src": [
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
    "projects/flyleaf/.env": "PORT=3000\n",
    "projects/flyleaf/README.md":
      "# Flyleaf\n\nThe API behind the booking app.\n\n| Route | Port |\n|---|---|\n| api | 3000 |\n",
    "projects/flyleaf/logo.svg":
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#000"/></svg>',
    "projects/flyleaf/src/index.ts":
      "export const port = 3000;\nexport const host = 'x';\n",
  },
};

/** Signed in by default: the app opens on the sign-in otherwise; account specs replace it. */
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
    license: "valid",
    licenseGrant: null,
    name: "Ada Lovelace",
    organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
    organizations: [
      { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
    ],
    role: "owner",
    servers: { limit: 3, used: 1 },
  },
  refusal: null,
  sealed: true,
  usage: {
    license: "valid",
    source: "platform",
    status: "granted",
    validUntil: null,
  },
};
