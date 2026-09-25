import type { Process } from "@pupitre/shared/agent-protocol/processes";
import type {
  ProjectBranchesResult,
  ProjectDiffResult,
  ProjectGitStatusResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";

// A field the agent would not fill is absent here too.
export const SNAPSHOT: SnapshotResult = {
  entitlement: "dev",
  machine: {
    agent_version: "0.1.0",
    arch: "amd64",
    cores: 4,
    disk_free_gb: 62.5,
    disk_total_gb: 160,
    hostname: "atelier",
    load: [0.42, 0.61, 0.55],
    os: "ubuntu",
    ram_total_mb: 8192,
    ram_used_mb: 3584,
    swap_mb: 0,
    uptime_s: 187_200,
    version: "24.04",
  },
  projects: [
    {
      branch: "main",
      boot: false,
      dir: "flyleaf",
      name: "flyleaf-api",
      path: "/home/dev/projects/flyleaf",
      processes: [
        {
          cmd: "bun run dev --port 3000",
          dir: ".",
          host: "127.0.0.1",
          id: "flyleaf-api",
          path: "/home/dev/projects/flyleaf",
          pid: 4821,
          pkgmgr: "bun",
          port: 3000,
          ram_mb: 412,
          routes: [
            { hostname: "flyleaf.example.org", label: "web", port: 3000 },
            { hostname: "api-flyleaf.example.org", label: "api", port: 3001 },
          ],
          state: "online",
          uptime_s: 5400,
          url: "https://flyleaf.example.org",
        },
      ],
      repo: "https://example.org/moi/flyleaf.git",
      state: "online",
      url: "https://flyleaf.example.org",
    },
    {
      boot: false,
      dir: "atlas",
      name: "atlas-web",
      path: "/home/dev/projects/atlas",
      processes: [
        {
          cmd: "pnpm dev --port 3100",
          dir: ".",
          host: "127.0.0.1",
          id: "atlas-web",
          path: "/home/dev/projects/atlas",
          pkgmgr: "pnpm",
          port: 3100,
          routes: [{ label: "web", port: 3100 }],
          state: "stopped",
        },
      ],
      state: "stopped",
    },
    {
      boot: false,
      dir: "billing",
      name: "billing",
      path: "/home/dev/projects/billing",
      processes: [
        {
          cmd: "./gradlew bootRun",
          dir: ".",
          host: "127.0.0.1",
          id: "billing",
          install: "./gradlew build",
          path: "/home/dev/projects/billing",
          pkgmgr: "gradle",
          port: 3200,
          ram_mb: 1536,
          routes: [],
          state: "failed",
        },
      ],
      state: "failed",
    },
  ],
  services: [
    {
      configured: true,
      id: "db.postgres",
      name: "PostgreSQL",
      port: 5432,
      runs: true,
      state: "running",
      unit: "postgresql.service",
      version: "17.2",
    },
    {
      configured: true,
      id: "ai.claude",
      name: "Claude Code",
      runs: true,
      state: "running",
    },
    {
      configured: true,
      id: "editor.jetbrains",
      name: "JetBrains Remote Dev",
      path: "/home/dev/.cache/JetBrains/RemoteDev/dist/idea-latest",
      runs: true,
      state: "stopped",
    },
    {
      configured: true,
      id: "exposure.cloudflare",
      name: "Cloudflare Tunnel",
      runs: true,
      state: "failed",
    },
    // Installed but not configured: the screen must not read it as a failure.
    {
      configured: false,
      id: "tool.github",
      name: "GitHub",
      runs: false,
      state: "stopped",
    },
  ],
  sessions: [
    {
      command: "claude",
      kind: "claude",
      pid: 5120,
      project: "flyleaf-api",
      ram_mb: 640,
      seconds: 2700,
    },
    {
      command: "idea-backend",
      kind: "ide",
      pid: 5301,
      ram_mb: 2048,
      seconds: 14_400,
    },
  ],
};

export const PROCESSES: Process[] = [
  {
    command: "bun run dev",
    cpu: 62.5,
    pid: 4821,
    project: "flyleaf-api",
    ram_mb: 412,
  },
  {
    command: "java -jar billing",
    cpu: 8,
    pid: 4990,
    project: "billing",
    ram_mb: 2560,
  },
];

export const GIT_STATUS: ProjectGitStatusResult = {
  ahead: 1,
  behind: 3,
  changed: 2,
  current: "main",
  dirty: true,
  last: 1_770_000_000,
  problem: "",
  repo: true,
  root: "/home/dev/projects/flyleaf",
  subject: "Corrige le calcul de TVA",
  upstream: "origin/main",
};

export const BRANCHES: ProjectBranchesResult = {
  current: "main",
  dirty: true,
  local: ["main", "feat/tarifs"],
  remote: ["main", "feat/tarifs", "release"],
  repo: true,
  root: "/home/dev/projects/flyleaf",
};

export const WORKING_TREE: ProjectWorkingTreeResult = {
  ahead: 1,
  behind: 3,
  branch: "main",
  files: [
    {
      added: 12,
      binary: false,
      code: "M ",
      path: "src/lib/tva.ts",
      removed: 4,
      stage: "staged",
    },
    {
      added: 3,
      binary: false,
      code: " M",
      path: "src/routes/facture.tsx",
      removed: 0,
      stage: "unstaged",
    },
    {
      added: 0,
      binary: false,
      code: "??",
      path: "notes.md",
      removed: 0,
      stage: "untracked",
    },
  ],
  repo: true,
  root: "/home/dev/projects/flyleaf",
  upstream: "origin/main",
};

export const DIFF: ProjectDiffResult = {
  binary: false,
  patch: [
    "diff --git a/src/lib/tva.ts b/src/lib/tva.ts",
    "@@ -1,3 +1,4 @@",
    " export function tva(base: number) {",
    "-  return base * 0.2",
    "+  return base * 0.21",
    " }",
  ].join("\n"),
  path: "src/lib/tva.ts",
  problem: "",
};
