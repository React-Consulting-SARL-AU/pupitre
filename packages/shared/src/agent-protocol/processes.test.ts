import { describe, expect, it } from "bun:test"
import {
  AgentOpenParamsSchema,
  AgentOpenResultSchema,
  ProcessesListResultSchema,
  ProcessKillParamsSchema,
  SessionsCleanResultSchema,
  SessionsListResultSchema,
  ShotsCleanResultSchema,
  ShotsListResultSchema,
  ShotsUrlResultSchema,
} from "./processes"

describe("AgentOpenParamsSchema and AgentOpenResultSchema", () => {
  it("open one of the three agents on a project", () => {
    expect(
      AgentOpenParamsSchema.safeParse({
        kind: "hermes",
        project: "flymate-api",
      }).success
    ).toBe(true)
    expect(
      AgentOpenResultSchema.safeParse({
        command: "tmux attach -t claude-flymate-api",
        session: "claude-flymate-api",
      }).success
    ).toBe(true)
  })

  it("reject an unknown agent", () => {
    expect(
      AgentOpenParamsSchema.safeParse({ kind: "copilot", project: "x" }).success
    ).toBe(false)
  })
})

describe("sessions and processes", () => {
  it("accept lists and counters", () => {
    expect(
      SessionsListResultSchema.safeParse({
        sessions: [
          {
            pid: 1,
            seconds: 10,
            ram_mb: 100,
            kind: "codex",
            command: "codex",
          },
        ],
      }).success
    ).toBe(true)
    expect(SessionsCleanResultSchema.safeParse({ killed: 2 }).success).toBe(
      true
    )
    expect(
      ProcessesListResultSchema.safeParse({
        processes: [
          {
            pid: 77,
            cpu: 12.5,
            ram_mb: 340,
            command: "node vite",
            project: "flymate-api",
          },
        ],
      }).success
    ).toBe(true)
    expect(
      ProcessKillParamsSchema.safeParse({ pid: 77, force: true }).success
    ).toBe(true)
  })

  it("reject a process without pid and a kill without pid", () => {
    expect(
      ProcessesListResultSchema.safeParse({
        processes: [{ cpu: 1, ram_mb: 1, command: "x", project: "" }],
      }).success
    ).toBe(false)
    expect(ProcessKillParamsSchema.safeParse({ force: true }).success).toBe(
      false
    )
  })
})

describe("shots", () => {
  it("accept a gallery listing, its url and a clean count", () => {
    expect(
      ShotsListResultSchema.safeParse({
        shots: [
          {
            name: "2026-09-04-10-00-00.png",
            path: "/home/dev/shots/2026-09-04-10-00-00.png",
            size_bytes: 120_000,
            created_at: "2026-09-04T10:00:00Z",
          },
        ],
      }).success
    ).toBe(true)
    expect(
      ShotsUrlResultSchema.safeParse({ url: "http://127.0.0.1:7777/" }).success
    ).toBe(true)
    expect(ShotsCleanResultSchema.safeParse({ removed: 3 }).success).toBe(true)
  })

  it("reject a shot without path", () => {
    expect(
      ShotsListResultSchema.safeParse({ shots: [{ name: "a.png" }] }).success
    ).toBe(false)
  })
})
