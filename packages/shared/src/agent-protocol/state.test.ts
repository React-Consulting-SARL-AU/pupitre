import { describe, expect, it } from "bun:test"
import {
  CompletionsParamsSchema,
  CompletionsResultSchema,
  MachineSchema,
  ProjectSchema,
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
  repo: "git@github.com:acme/flymate.git",
  pkgmgr: "bun",
  host: "127.0.0.1",
  port: 5173,
  subdomain: "flymate",
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
