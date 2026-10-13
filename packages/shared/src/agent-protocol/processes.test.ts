import { describe, expect, it } from "bun:test"
import {
  AgentOpenParamsSchema,
  AgentOpenResultSchema,
  ProcessesListResultSchema,
  ProcessKillParamsSchema,
  SessionsCleanResultSchema,
  SessionsListResultSchema,
} from "./processes"

describe("AgentOpenParamsSchema and AgentOpenResultSchema", () => {
  it("open one of the agents on a project", () => {
    expect(
      AgentOpenParamsSchema.safeParse({
        kind: "hermes",
        project: "flyleaf-api",
      }).success
    ).toBe(true)
    expect(
      AgentOpenResultSchema.safeParse({
        command: "tmux attach -t claude-flyleaf-api",
        session: "claude-flyleaf-api",
      }).success
    ).toBe(true)
  })

  it("reject an unknown agent", () => {
    expect(
      AgentOpenParamsSchema.safeParse({ kind: "aider", project: "x" }).success
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
            project: "flyleaf-api",
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
