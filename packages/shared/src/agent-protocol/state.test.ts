import { describe, expect, it } from "bun:test"
import {
  CompletionsParamsSchema,
  CompletionsResultSchema,
  HostnameSchema,
  LOGIN_STATES,
  MachineSchema,
  ProjectRegistrationSchema,
  ProjectSchema,
  RouteRequestSchema,
  RouteSchema,
  ServiceActionParamsSchema,
  ServiceLogsParamsSchema,
  ServiceLogsResultSchema,
  ServiceSchema,
  ServiceStatusParamsSchema,
  ServiceStatusResultSchema,
  SessionSchema,
  SnapshotResultSchema,
  StatusResultSchema,
} from "./state"

const machine = {
  hostname: "vps-1",
  os: "ubuntu",
  version: "24.04",
  arch: "arm64",
  cores: 4,
  uptime_s: 86_400,
  load: [0.12, 0.2, 0.25],
  ram_total_mb: 7936,
  ram_used_mb: 2048,
  swap_mb: 2048,
  disk_total_gb: 80,
  disk_free_gb: 61.4,
  agent_version: "0.3.1",
}

const service = {
  id: "db.postgres",
  name: "PostgreSQL 17",
  state: "running",
  version: "17.2",
  port: 5432,
  unit: "postgresql.service",
}

const process = {
  id: "api",
  dir: "api",
  path: "/home/dev/projects/flymate/api",
  pkgmgr: "bun",
  host: "127.0.0.1",
  port: 5173,
  routes: [{ label: "web", port: 5173, hostname: "flymate.example.org" }],
  cmd: "bun run dev",
  install: "bun install",
  state: "online",
  url: "http://127.0.0.1:5173",
  pid: 4242,
  ram_mb: 310,
  uptime_s: 3600,
}

const project = {
  name: "flymate",
  dir: "flymate",
  path: "/home/dev/projects/flymate",
  repo: "git@github.com:acme/flymate.git",
  processes: [process],
  state: "online",
  url: "https://flymate.example.org",
  branch: "main",
}

const session = {
  pid: 3131,
  seconds: 1200,
  ram_mb: 512,
  kind: "claude",
  project: "flymate-api",
  command: "claude --resume",
}

describe("SnapshotResultSchema", () => {
  it("accepts the dashboard snapshot", () => {
    expect(
      SnapshotResultSchema.safeParse({
        machine,
        services: [service],
        projects: [project],
        sessions: [session],
        entitlement: "valid",
      }).success
    ).toBe(true)
  })

  it("rejects a snapshot without machine and one with a bad project state", () => {
    expect(
      SnapshotResultSchema.safeParse({
        services: [],
        projects: [],
        sessions: [],
        entitlement: "valid",
      }).success
    ).toBe(false)
    expect(
      SnapshotResultSchema.safeParse({
        machine,
        services: [],
        projects: [{ ...project, state: "sleeping" }],
        sessions: [],
        entitlement: "valid",
      }).success
    ).toBe(false)
  })
})

describe("MachineSchema, ServiceSchema, ProjectSchema, SessionSchema", () => {
  it("accept their examples", () => {
    expect(MachineSchema.safeParse(machine).success).toBe(true)
    expect(ServiceSchema.safeParse(service).success).toBe(true)
    expect(ProjectSchema.safeParse(project).success).toBe(true)
    expect(SessionSchema.safeParse(session).success).toBe(true)
    expect(SessionSchema.safeParse({ ...session, kind: "ide" }).success).toBe(
      true
    )
  })

  it("lists the majors a runtime holds, and nothing for a service held at one version", () => {
    expect(ServiceSchema.parse(service).versions).toBeUndefined()
    expect(
      ServiceSchema.parse({
        id: "runtime.node",
        name: "Node.js",
        state: "running",
        version: "node 24.8.0 · 22.19.0",
        versions: ["24", "22"],
      }).versions
    ).toEqual(["24", "22"])
  })

  it("takes a service from an agent that says nothing as one that runs", () => {
    const parsed = ServiceSchema.parse(service)

    expect(parsed.runs).toBe(true)
    expect(ServiceSchema.parse({ ...service, runs: false }).runs).toBe(false)
  })

  it("carries the account a module declares, and only one the catalogue names", () => {
    expect(ServiceSchema.parse(service).connection).toBeUndefined()
    expect(
      ServiceSchema.parse({ ...service, connection: "cloudflare" }).connection
    ).toBe("cloudflare")
    expect(
      ServiceSchema.safeParse({ ...service, connection: "railway" }).success
    ).toBe(false)
  })

  it("reject a three-value load with a string and an unknown session kind", () => {
    expect(
      MachineSchema.safeParse({ ...machine, load: "0.12 0.2 0.25" }).success
    ).toBe(false)
    expect(ServiceSchema.safeParse({ ...service, state: "on" }).success).toBe(
      false
    )
    expect(SessionSchema.safeParse({ ...session, kind: "aider" }).success).toBe(
      false
    )
  })

  it("requires an absolute path on a project and on each process", () => {
    const { path: _path, ...withoutPath } = project

    expect(ProjectSchema.safeParse(withoutPath).success).toBe(false)
    expect(
      ProjectSchema.safeParse({ ...project, path: "flymate" }).success
    ).toBe(false)
    expect(
      ProjectSchema.safeParse({
        ...project,
        processes: [{ ...process, path: "flymate/api" }],
      }).success
    ).toBe(false)
  })

  it("requires one process at the least, and takes partial only on the project", () => {
    expect(ProjectSchema.safeParse({ ...project, processes: [] }).success).toBe(
      false
    )
    expect(
      ProjectSchema.safeParse({ ...project, state: "partial" }).success
    ).toBe(true)
    expect(
      ProjectSchema.safeParse({
        ...project,
        processes: [{ ...process, state: "partial" }],
      }).success
    ).toBe(false)
  })

  it("registers a project as a repository and its processes, ids unique, folders inside", () => {
    const registration = {
      name: "intranet",
      dir: "intranet",
      repo: "git@github.com:acme/intranet.git",
      processes: [
        {
          id: "server",
          pkgmgr: "gradle",
          host: "127.0.0.1",
          port: 8081,
          cmd: "SERVER_PORT=8081 ./gradlew :server:bootRun",
          routes: [],
        },
        {
          id: "client",
          dir: "client",
          pkgmgr: "pnpm",
          host: "127.0.0.1",
          port: 3001,
          cmd: "pnpm dev",
          routes: [{ label: "client", port: 3001, subdomain: "intranet" }],
        },
      ],
    }

    const parsed = ProjectRegistrationSchema.parse(registration)

    expect(parsed.processes[0]?.dir).toBe(".")
    expect(parsed.processes[1]?.dir).toBe("client")
    expect(
      ProjectRegistrationSchema.safeParse({ ...registration, processes: [] })
        .success
    ).toBe(false)
    expect(
      ProjectRegistrationSchema.safeParse({
        ...registration,
        processes: registration.processes.map((one) => ({ ...one, id: "app" })),
      }).success
    ).toBe(false)

    for (const dir of ["/etc", "../other", "client/../..", ""]) {
      expect(
        ProjectRegistrationSchema.safeParse({
          ...registration,
          processes: [{ ...registration.processes[0], dir }],
        }).success
      ).toBe(false)
    }
  })

  /** Starting with the server is asked for, never assumed: a registration and a project that say nothing do not. */
  it("starts with the server only when asked", () => {
    const registration = {
      name: "web",
      dir: "web",
      processes: [
        {
          id: "api",
          pkgmgr: "bun",
          host: "127.0.0.1",
          port: 5173,
          cmd: "bun run dev",
          routes: [],
        },
      ],
    }

    expect(ProjectRegistrationSchema.parse(registration).boot).toBe(false)
    expect(
      ProjectRegistrationSchema.parse({ ...registration, boot: true }).boot
    ).toBe(true)
    expect(ProjectSchema.parse(project).boot).toBe(false)
    expect(ProjectSchema.parse({ ...project, boot: true }).boot).toBe(true)
  })

  /** A project names the runtime versions it runs on, by mise tool; naming none runs at the machine's default. */
  it("pins runtime versions by tool, and none by default", () => {
    const registration = {
      name: "web",
      dir: "web",
      processes: [
        {
          id: "api",
          pkgmgr: "bun",
          host: "127.0.0.1",
          port: 5173,
          cmd: "bun run dev",
          routes: [],
        },
      ],
    }

    expect(
      ProjectRegistrationSchema.parse(registration).runtimes
    ).toBeUndefined()
    expect(
      ProjectRegistrationSchema.parse({
        ...registration,
        runtimes: { node: "22", python: "3.12" },
      }).runtimes
    ).toEqual({ node: "22", python: "3.12" })
    expect(ProjectSchema.parse(project).runtimes).toBeUndefined()
    expect(ProjectSchema.parse({ ...project, runtimes: {} }).runtimes).toEqual(
      {}
    )
    expect(
      ProjectRegistrationSchema.safeParse({
        ...registration,
        runtimes: { deno: "2" },
      }).success
    ).toBe(false)
    expect(
      ProjectRegistrationSchema.safeParse({
        ...registration,
        runtimes: { node: "latest" },
      }).success
    ).toBe(false)
  })
})

describe("RouteSchema, RouteRequestSchema and HostnameSchema", () => {
  it("store a whole hostname, and declare a subdomain", () => {
    expect(
      RouteSchema.safeParse({
        label: "api",
        port: 3001,
        hostname: "api-shop.example.org",
      }).success
    ).toBe(true)
    expect(RouteSchema.safeParse({ label: "api", port: 3001 }).success).toBe(
      true
    )
    expect(
      RouteRequestSchema.safeParse({
        label: "api",
        port: 3001,
        subdomain: "api-shop",
      }).success
    ).toBe(true)
    expect(
      RouteRequestSchema.safeParse({
        label: "api",
        port: 3001,
        hostname: "api-shop.example.org",
      }).success
    ).toBe(false)
  })

  it("refuse a label that is not one DNS label, and a hostname of one", () => {
    for (const label of ["", "Api", "api.shop", "-api", "api-"]) {
      expect(RouteSchema.safeParse({ label, port: 3001 }).success).toBe(false)
    }

    expect(HostnameSchema.safeParse("example").success).toBe(false)
    expect(HostnameSchema.safeParse("shop.example.org").success).toBe(true)
    expect(HostnameSchema.safeParse("a..example.org").success).toBe(false)
  })

  it("keep a process's routes as a list, empty included", () => {
    expect(
      ProjectSchema.safeParse({
        ...project,
        processes: [{ ...process, routes: [] }],
      }).success
    ).toBe(true)
    expect(
      ProjectSchema.safeParse({
        ...project,
        processes: [{ ...process, routes: undefined }],
      }).success
    ).toBe(false)
  })
})

describe("StatusResultSchema", () => {
  it("only carries services and projects", () => {
    expect(
      StatusResultSchema.safeParse({ services: [service], projects: [project] })
        .success
    ).toBe(true)
    expect(StatusResultSchema.safeParse({ services: [] }).success).toBe(false)
  })
})

describe("ServiceStatusParamsSchema and ServiceStatusResultSchema", () => {
  it("accept a module id and a masked credential set", () => {
    expect(
      ServiceStatusParamsSchema.safeParse({ id: "db.postgres" }).success
    ).toBe(true)
    expect(
      ServiceStatusResultSchema.safeParse({
        ...service,
        credentials: { app_user: "flymate", app_password: "••••••••" },
      }).success
    ).toBe(true)
  })

  it("reject a missing id and a non-string credential", () => {
    expect(ServiceStatusParamsSchema.safeParse({}).success).toBe(false)
    expect(
      ServiceStatusResultSchema.safeParse({
        ...service,
        credentials: { app_password: 42 },
      }).success
    ).toBe(false)
  })

  it("carry whether the CLI is signed in, and under which account", () => {
    expect(
      ServiceStatusResultSchema.safeParse({
        ...service,
        login: { state: "signed_in", account: "jordan@example.org" },
      }).success
    ).toBe(true)
    expect(
      ServiceStatusResultSchema.safeParse({
        ...service,
        login: { state: "signed_out", fix: "Run gh auth login." },
      }).success
    ).toBe(true)
    expect(
      ServiceStatusResultSchema.safeParse({
        ...service,
        login: { state: "expired" },
      }).success
    ).toBe(false)
    expect(LOGIN_STATES).toEqual(["signed_in", "signed_out", "unknown"])
  })
})

describe("ServiceActionParamsSchema", () => {
  it("names the module whose unit is driven, and nothing else", () => {
    expect(
      ServiceActionParamsSchema.safeParse({ id: "db.postgres" }).success
    ).toBe(true)
    expect(ServiceActionParamsSchema.safeParse({}).success).toBe(false)
    expect(
      ServiceActionParamsSchema.safeParse({ id: "db.postgres", force: true })
        .success
    ).toBe(false)
  })
})

describe("ServiceLogsParamsSchema and ServiceLogsResultSchema", () => {
  it("read a tail of the unit's journal, and follow it on demand", () => {
    expect(
      ServiceLogsParamsSchema.safeParse({ id: "db.postgres" }).success
    ).toBe(true)
    expect(
      ServiceLogsParamsSchema.safeParse({
        id: "db.postgres",
        lines: 50,
        follow: true,
      }).success
    ).toBe(true)
    expect(
      ServiceLogsResultSchema.safeParse({ lines: ["ready", "listening"] })
        .success
    ).toBe(true)
  })

  it("reject a missing id, a non-positive tail and an unknown key", () => {
    expect(ServiceLogsParamsSchema.safeParse({ lines: 10 }).success).toBe(false)
    expect(
      ServiceLogsParamsSchema.safeParse({ id: "db.postgres", lines: 0 }).success
    ).toBe(false)
    expect(
      ServiceLogsParamsSchema.safeParse({ id: "db.postgres", unit: "x" })
        .success
    ).toBe(false)
  })
})

describe("CompletionsParamsSchema", () => {
  it("accepts a folder to list, and none", () => {
    expect(CompletionsParamsSchema.safeParse({}).success).toBe(true)
    expect(
      CompletionsParamsSchema.safeParse({ path: "flymate/api" }).success
    ).toBe(true)
  })

  it("rejects an unknown key", () => {
    expect(CompletionsParamsSchema.safeParse({ dir: "flymate" }).success).toBe(
      false
    )
  })
})

describe("CompletionsResultSchema", () => {
  const completions = {
    command: "dev",
    sub: [{ name: "up", help: "start a project", args: [["$project", "all"]] }],
    projects: ["flymate-api"],
    root: "/home/dev/projects",
    path: "",
    paths: ["flymate/", "README.md"],
  }

  it("accepts the grammar, the projects and the paths", () => {
    expect(CompletionsResultSchema.safeParse(completions).success).toBe(true)
  })

  it("rejects a sub-command without args", () => {
    expect(
      CompletionsResultSchema.safeParse({
        ...completions,
        sub: [{ name: "up", help: "start a project" }],
      }).success
    ).toBe(false)
  })

  it("rejects a grammar without its projects", () => {
    const { projects: _projects, ...rest } = completions

    expect(CompletionsResultSchema.safeParse(rest).success).toBe(false)
  })
})
