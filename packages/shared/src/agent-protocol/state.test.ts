import { describe, expect, it } from "bun:test"
import {
  CompletionsParamsSchema,
  CompletionsResultSchema,
  HostnameSchema,
  MachineSchema,
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

const project = {
  name: "flymate-api",
  dir: "flymate/api",
  path: "/home/dev/projects/flymate/api",
  repo: "git@github.com:acme/flymate.git",
  pkgmgr: "bun",
  host: "127.0.0.1",
  port: 5173,
  routes: [{ label: "web", port: 5173, hostname: "flymate.example.org" }],
  cmd: "bun run dev",
  install: "bun install",
  state: "online",
  url: "http://127.0.0.1:5173",
  branch: "main",
  pid: 4242,
  ram_mb: 310,
  uptime_s: 3600,
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

  it("takes a service from an agent that says nothing as one that runs", () => {
    const parsed = ServiceSchema.parse(service)

    expect(parsed.runs).toBe(true)
    expect(ServiceSchema.parse({ ...service, runs: false }).runs).toBe(false)
  })

  it("reject a three-value load with a string and an unknown session kind", () => {
    expect(
      MachineSchema.safeParse({ ...machine, load: "0.12 0.2 0.25" }).success
    ).toBe(false)
    expect(ServiceSchema.safeParse({ ...service, state: "on" }).success).toBe(
      false
    )
    expect(
      SessionSchema.safeParse({ ...session, kind: "cursor" }).success
    ).toBe(false)
  })

  it("requires an absolute path on a project", () => {
    const { path: _path, ...withoutPath } = project

    expect(ProjectSchema.safeParse(withoutPath).success).toBe(false)
    expect(
      ProjectSchema.safeParse({ ...project, path: "flymate/api" }).success
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

  it("keep a project's routes as a list, empty included", () => {
    expect(ProjectSchema.safeParse({ ...project, routes: [] }).success).toBe(
      true
    )
    expect(
      ProjectSchema.safeParse({ ...project, routes: undefined }).success
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
