import { describe, expect, it } from "bun:test"
import {
  ProjectActionResultSchema,
  ProjectAddParamsSchema,
  ProjectBranchesResultSchema,
  ProjectCheckoutParamsSchema,
  ProjectDebugResultSchema,
  ProjectDiffParamsSchema,
  ProjectDiffResultSchema,
  ProjectEnvParamsSchema,
  ProjectEnvResultSchema,
  ProjectGitStatusResultSchema,
  ProjectListResultSchema,
  ProjectLogsParamsSchema,
  ProjectLogsResultSchema,
  ProjectParamsSchema,
  ProjectRemoveResultSchema,
  ProjectSyncResultSchema,
  ProjectTargetParamsSchema,
  ProjectUrlResultSchema,
  ProjectWorkingTreeResultSchema,
} from "./projects"

describe("ProjectParamsSchema and ProjectTargetParamsSchema", () => {
  it("name a project, and accept all only as a target", () => {
    expect(ProjectParamsSchema.safeParse({ name: "flymate-api" }).success).toBe(
      true
    )
    expect(ProjectParamsSchema.safeParse({ name: "" }).success).toBe(false)
    expect(ProjectTargetParamsSchema.safeParse({ name: "all" }).success).toBe(
      true
    )
    expect(ProjectTargetParamsSchema.safeParse({}).success).toBe(false)
  })
})

describe("ProjectAddParamsSchema", () => {
  it("accepts the registry row", () => {
    expect(
      ProjectAddParamsSchema.safeParse({
        name: "flymate-api",
        dir: "flymate/api",
        repo: "git@github.com:acme/flymate.git",
        pkgmgr: "bun",
        host: "127.0.0.1",
        port: 5173,
        subdomain: "flymate",
        cmd: "bun run dev",
        install: "bun install",
      }).success
    ).toBe(true)
  })

  it("rejects an unknown package manager and a port out of range", () => {
    const base = {
      name: "flymate-api",
      dir: "flymate/api",
      pkgmgr: "bun",
      host: "127.0.0.1",
      port: 5173,
      cmd: "bun run dev",
    }
    expect(
      ProjectAddParamsSchema.safeParse({ ...base, pkgmgr: "cargo" }).success
    ).toBe(false)
    expect(
      ProjectAddParamsSchema.safeParse({ ...base, port: 70_000 }).success
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
      ProjectActionResultSchema.safeParse({ state: "online", port: 5173 })
        .success
    ).toBe(true)
    expect(
      ProjectActionResultSchema.safeParse({
        state: "online",
        projects: [{ name: "flymate-api", state: "online", port: 5173 }],
      }).success
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
        name: "flymate-api",
        lines: 200,
        follow: true,
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
