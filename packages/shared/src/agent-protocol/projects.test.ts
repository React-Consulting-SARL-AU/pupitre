import { describe, expect, it } from "bun:test"
import {
  ProcessParamsSchema,
  ProjectActionResultSchema,
  ProjectAddParamsSchema,
  ProjectBranchesResultSchema,
  ProjectCheckoutParamsSchema,
  ProjectDebugResultSchema,
  ProjectDetectParamsSchema,
  ProjectDetectResultSchema,
  ProjectDiffParamsSchema,
  ProjectDiffResultSchema,
  ProjectEnvParamsSchema,
  ProjectEnvResultSchema,
  ProjectGitStatusResultSchema,
  ProjectInstallParamsSchema,
  ProjectInstallResultSchema,
  ProjectListResultSchema,
  ProjectLogsParamsSchema,
  ProjectLogsResultSchema,
  ProjectParamsSchema,
  ProjectRemoveResultSchema,
  ProjectSyncResultSchema,
  ProjectTargetParamsSchema,
  ProjectUpdateParamsSchema,
  ProjectUrlResultSchema,
  ProjectWorkingTreeResultSchema,
} from "./projects"

const server = {
  id: "server",
  pkgmgr: "gradle",
  host: "127.0.0.1",
  port: 8081,
  cmd: "SERVER_PORT=8081 ./gradlew :server:bootRun --console=plain",
  routes: [],
}

const client = {
  id: "client",
  dir: "client",
  pkgmgr: "pnpm",
  host: "127.0.0.1",
  port: 3001,
  cmd: "pnpm dev",
  install: "pnpm install",
  routes: [{ label: "client", port: 3001, subdomain: "intranet" }],
}

const registration = {
  name: "intranet",
  dir: "intranet",
  repo: "git@github.com:acme/intranet.git",
  processes: [server, client],
}

describe("ProjectParamsSchema, ProcessParamsSchema and ProjectTargetParamsSchema", () => {
  it("name a project, a process of it, and accept all only as a target", () => {
    expect(ProjectParamsSchema.safeParse({ name: "flymate-api" }).success).toBe(
      true
    )
    expect(ProjectParamsSchema.safeParse({ name: "" }).success).toBe(false)
    expect(
      ProcessParamsSchema.safeParse({ name: "intranet", process: "server" })
        .success
    ).toBe(true)
    expect(ProcessParamsSchema.safeParse({ name: "intranet" }).success).toBe(
      false
    )
    expect(ProjectTargetParamsSchema.safeParse({ name: "all" }).success).toBe(
      true
    )
    expect(
      ProjectTargetParamsSchema.safeParse({
        name: "intranet",
        process: "server",
      }).success
    ).toBe(true)
    expect(
      ProjectTargetParamsSchema.safeParse({ name: "all", process: "server" })
        .success
    ).toBe(false)
    expect(ProjectTargetParamsSchema.safeParse({}).success).toBe(false)
  })
})

describe("ProjectAddParamsSchema", () => {
  it("accepts a repository and its processes, the root folder implied", () => {
    const parsed = ProjectAddParamsSchema.safeParse(registration)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.processes[0]?.dir).toBe(".")
    expect(parsed.data?.processes[1]?.dir).toBe("client")
  })

  it("takes the branch to clone, and refuses one git would not", () => {
    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        branch: "release/2.0",
      }).success
    ).toBe(true)
    expect(
      ProjectAddParamsSchema.safeParse({ ...registration, branch: "" }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({ ...registration, branch: "-force" })
        .success
    ).toBe(false)
  })

  it("takes a subdomain of one level or several on a route, and refuses what DNS would", () => {
    const withSubdomain = (subdomain: string) => ({
      ...registration,
      processes: [
        { ...client, routes: [{ label: "client", port: 3001, subdomain }] },
      ],
    })

    for (const subdomain of ["shop", "api.shop", "a-b.c-d.e"]) {
      expect(
        ProjectAddParamsSchema.safeParse(withSubdomain(subdomain)).success
      ).toBe(true)
    }

    for (const subdomain of ["", "-shop", "shop-", ".shop", "shop.", "a..b"]) {
      expect(
        ProjectAddParamsSchema.safeParse(withSubdomain(subdomain)).success
      ).toBe(false)
    }
  })

  it("requires the routes of each process, and refuses a hostname in them", () => {
    const { routes: _routes, ...withoutRoutes } = client

    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        processes: [withoutRoutes],
      }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        processes: [
          {
            ...client,
            routes: [
              { label: "client", port: 3001, hostname: "web.example.org" },
            ],
          },
        ],
      }).success
    ).toBe(false)
  })

  it("takes the loopback or a .localhost name as host, nothing else", () => {
    const withHost = (host: string) => ({
      ...registration,
      processes: [{ ...client, host }],
    })

    for (const host of [
      "127.0.0.1",
      "react-box.localhost",
      "api.shop.localhost",
    ]) {
      expect(ProjectAddParamsSchema.safeParse(withHost(host)).success).toBe(
        true
      )
    }

    for (const host of [
      "localhost",
      "0.0.0.0",
      "shop.example.org",
      "React.localhost",
      "-a.localhost",
      "",
    ]) {
      expect(ProjectAddParamsSchema.safeParse(withHost(host)).success).toBe(
        false
      )
    }
  })

  it("rejects an unknown package manager, a port out of range, a process id that is not a label, and two processes of one id", () => {
    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        processes: [{ ...client, pkgmgr: "cargo" }],
      }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        processes: [{ ...client, port: 70_000 }],
      }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        processes: [{ ...client, id: "Client" }],
      }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({
        ...registration,
        processes: [server, { ...client, id: "server" }],
      }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({ ...registration, processes: [] })
        .success
    ).toBe(false)
  })
})

describe("ProjectUpdateParamsSchema", () => {
  it("takes a patch of the branch and of the whole list of processes", () => {
    expect(
      ProjectUpdateParamsSchema.safeParse({
        name: "intranet",
        patch: {
          branch: "release/2.0",
          processes: [
            { ...server, install: "" },
            {
              ...client,
              routes: [
                { label: "client", port: 3001, subdomain: "intranet" },
                {
                  label: "api",
                  port: 3002,
                  hostname: "api.intranet.example.org",
                },
                { label: "docs", port: 3003 },
              ],
            },
          ],
        },
      }).success
    ).toBe(true)
    expect(
      ProjectUpdateParamsSchema.safeParse({ name: "intranet", patch: {} })
        .success
    ).toBe(true)
  })

  it("refuses a route naming a subdomain and a hostname at once, an empty command, an empty list and a folder", () => {
    expect(
      ProjectUpdateParamsSchema.safeParse({
        name: "intranet",
        patch: {
          processes: [
            {
              ...client,
              routes: [
                {
                  label: "web",
                  port: 3000,
                  subdomain: "shop",
                  hostname: "shop.example.org",
                },
              ],
            },
          ],
        },
      }).success
    ).toBe(false)
    expect(
      ProjectUpdateParamsSchema.safeParse({
        name: "intranet",
        patch: { processes: [{ ...client, cmd: "" }] },
      }).success
    ).toBe(false)
    expect(
      ProjectUpdateParamsSchema.safeParse({
        name: "intranet",
        patch: { processes: [] },
      }).success
    ).toBe(false)
    expect(
      ProjectUpdateParamsSchema.safeParse({
        name: "intranet",
        patch: { dir: "elsewhere" },
      }).success
    ).toBe(false)
  })
})

describe("ProjectDetectResultSchema", () => {
  it("carries one process per folder that asks for one, the routes of a monorepo among them", () => {
    expect(
      ProjectDetectResultSchema.safeParse({
        processes: [
          {
            id: "shop",
            dir: ".",
            pkgmgr: "bun",
            install: "bun install",
            cmd: "bunx turbo run dev",
            port_hint: 3000,
            routes: [
              { label: "web", port: 3000 },
              { label: "api", port: 3001 },
            ],
          },
        ],
      }).success
    ).toBe(true)
    expect(
      ProjectDetectResultSchema.safeParse({
        processes: [
          { id: "server", dir: ".", pkgmgr: "gradle" },
          { id: "client", dir: "client", pkgmgr: "pnpm", port_hint: 3001 },
        ],
      }).success
    ).toBe(true)
    expect(ProjectDetectResultSchema.safeParse({ processes: [] }).success).toBe(
      false
    )
    expect(
      ProjectDetectResultSchema.safeParse({
        processes: [
          {
            id: "shop",
            dir: ".",
            pkgmgr: "bun",
            routes: [{ label: "Web", port: 3000 }],
          },
        ],
      }).success
    ).toBe(false)
  })
})

describe("project results", () => {
  it("accept their examples", () => {
    expect(ProjectListResultSchema.safeParse({ projects: [] }).success).toBe(
      true
    )
    expect(
      ProjectRemoveResultSchema.safeParse({
        name: "flymate-api",
        dir: "/home/dev/projects/flymate/api",
      }).success
    ).toBe(true)
    expect(
      ProjectActionResultSchema.safeParse({ state: "partial" }).success
    ).toBe(true)
    expect(
      ProjectActionResultSchema.safeParse({
        state: "online",
        projects: [{ name: "flymate-api", state: "online" }],
      }).success
    ).toBe(true)
    expect(
      ProjectInstallResultSchema.safeParse({
        done: true,
        installed: [{ process: "client", command: "pnpm install" }],
      }).success
    ).toBe(true)
    expect(
      ProjectInstallResultSchema.safeParse({ done: true, installed: [] })
        .success
    ).toBe(true)
    expect(
      ProjectLogsResultSchema.safeParse({ lines: ["ready"] }).success
    ).toBe(true)
    expect(
      ProjectSyncResultSchema.safeParse({
        pulled: true,
        installed: true,
        state: "online",
      }).success
    ).toBe(true)
    expect(
      ProjectEnvResultSchema.safeParse({
        path: "/home/dev/projects/flymate/api/.env.local",
        written: true,
        keys: ["DATABASE_URL"],
      }).success
    ).toBe(true)
    expect(
      ProjectBranchesResultSchema.safeParse({
        repo: true,
        root: "flymate",
        current: "main",
        dirty: false,
        local: ["main"],
        remote: ["origin/main"],
      }).success
    ).toBe(true)
    expect(
      ProjectGitStatusResultSchema.safeParse({
        repo: true,
        root: "flymate",
        current: "main",
        upstream: "origin/main",
        behind: 3,
        ahead: 0,
        dirty: false,
        changed: 0,
        last: 1_756_900_000,
        subject: "fix: retry on 502",
        problem: "",
      }).success
    ).toBe(true)
    expect(
      ProjectWorkingTreeResultSchema.safeParse({
        repo: true,
        root: "flymate",
        branch: "main",
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        files: [
          {
            path: "src/index.ts",
            code: " M",
            stage: "unstaged",
            added: 4,
            removed: 1,
            binary: false,
          },
        ],
      }).success
    ).toBe(true)
    expect(
      ProjectDiffResultSchema.safeParse({
        path: "src/index.ts",
        patch: "--- a\n+++ b\n",
        binary: false,
        problem: "",
      }).success
    ).toBe(true)
    expect(
      ProjectUrlResultSchema.safeParse({ url: "https://flymate.acme.dev" })
        .success
    ).toBe(true)
    expect(
      ProjectDebugResultSchema.safeParse({
        state: "online",
        port: 8080,
        debug_port: 5005,
      }).success
    ).toBe(true)
  })

  it("reject a diff without patch, an env result leaking values, a bad file stage", () => {
    expect(
      ProjectDiffResultSchema.safeParse({ path: "a", binary: false }).success
    ).toBe(false)
    expect(
      ProjectEnvResultSchema.safeParse({
        path: "/x/.env.local",
        written: true,
        keys: [{ DATABASE_URL: "postgres://…" }],
      }).success
    ).toBe(false)
    expect(
      ProjectWorkingTreeResultSchema.safeParse({
        repo: true,
        root: "flymate",
        branch: "main",
        upstream: "",
        ahead: 0,
        behind: 0,
        files: [
          {
            path: "a",
            code: "??",
            stage: "new",
            added: 0,
            removed: 0,
            binary: false,
          },
        ],
      }).success
    ).toBe(false)
  })
})

describe("project params with options", () => {
  it("accept logs, env, checkout and diff params", () => {
    expect(
      ProjectLogsParamsSchema.safeParse({
        name: "intranet",
        process: "server",
        lines: 200,
        follow: true,
      }).success
    ).toBe(true)
    expect(
      ProjectLogsParamsSchema.safeParse({ name: "intranet", lines: 200 })
        .success
    ).toBe(false)
    expect(
      ProjectInstallParamsSchema.safeParse({ name: "intranet" }).success
    ).toBe(true)
    expect(
      ProjectInstallParamsSchema.safeParse({
        name: "intranet",
        process: "client",
      }).success
    ).toBe(true)
    expect(
      ProjectEnvParamsSchema.safeParse({ name: "flymate-api", force: true })
        .success
    ).toBe(true)
    expect(
      ProjectCheckoutParamsSchema.safeParse({
        name: "flymate-api",
        branch: "feat/x",
      }).success
    ).toBe(true)
    expect(
      ProjectDiffParamsSchema.safeParse({
        name: "flymate-api",
        path: "src/index.ts",
      }).success
    ).toBe(true)
  })

  it("reject negative lines, a missing branch and a missing path", () => {
    expect(
      ProjectLogsParamsSchema.safeParse({ name: "flymate-api", lines: -1 })
        .success
    ).toBe(false)
    expect(
      ProjectCheckoutParamsSchema.safeParse({ name: "flymate-api" }).success
    ).toBe(false)
    expect(
      ProjectDiffParamsSchema.safeParse({ name: "flymate-api" }).success
    ).toBe(false)
  })
})

describe("ProjectDetectParamsSchema", () => {
  it("takes a repository or a folder, one of the two", () => {
    expect(
      ProjectDetectParamsSchema.safeParse({
        repo: "https://github.com/acme/flymate.git",
      }).success
    ).toBe(true)
    expect(
      ProjectDetectParamsSchema.safeParse({ dir: "flymate/api" }).success
    ).toBe(true)
    expect(
      ProjectDetectParamsSchema.safeParse({ repo: "x", dir: "y" }).success
    ).toBe(false)
    expect(ProjectDetectParamsSchema.safeParse({}).success).toBe(false)
  })

  it("takes a branch with a repository, and never with a folder", () => {
    expect(
      ProjectDetectParamsSchema.safeParse({
        repo: "https://github.com/acme/flymate.git",
        branch: "release/2.0",
      }).success
    ).toBe(true)
    expect(
      ProjectDetectParamsSchema.safeParse({
        dir: "flymate/api",
        branch: "main",
      }).success
    ).toBe(false)
    expect(
      ProjectDetectParamsSchema.safeParse({
        repo: "https://github.com/acme/flymate.git",
        branch: "-wat",
      }).success
    ).toBe(false)
  })
})

describe("ProjectDetectResultSchema", () => {
  it("proposes a package manager, a start command and a port on each process", () => {
    expect(
      ProjectDetectResultSchema.safeParse({
        processes: [
          {
            id: "flymate",
            dir: ".",
            pkgmgr: "bun",
            install: "bun install",
            cmd: "bun run dev --port 3000",
            port_hint: 3000,
          },
        ],
      }).success
    ).toBe(true)
  })

  it("keeps everything but the id, the folder and the package manager optional", () => {
    expect(
      ProjectDetectResultSchema.safeParse({
        processes: [{ id: "app", dir: ".", pkgmgr: "none" }],
      }).success
    ).toBe(true)
    expect(
      ProjectDetectResultSchema.safeParse({ processes: [{ pkgmgr: "none" }] })
        .success
    ).toBe(false)
    expect(
      ProjectDetectResultSchema.safeParse({
        processes: [{ id: "app", dir: ".", pkgmgr: "cargo" }],
      }).success
    ).toBe(false)
  })
})
