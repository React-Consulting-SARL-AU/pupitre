import { describe, expect, it } from "bun:test"
import {
  AgentOpenParamsSchema,
  AgentOpenResultSchema,
  ProcessesListResultSchema,
  ProcessKillParamsSchema,
  SessionsCleanResultSchema,
  SessionsListResultSchema,
  SHOT_CHUNK_BYTES,
  SHOT_MAX_BYTES,
  ShotEventSchema,
  ShotsCleanResultSchema,
  ShotsListResultSchema,
  ShotsReadParamsSchema,
  ShotsReadResultSchema,
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

describe("shots.read", () => {
  const result = {
    path: "2026-09-04/login.png",
    media_type: "image/png",
    size_bytes: 98_304,
    sha256: "a".repeat(64),
    chunks: 2,
  }

  it("accepts the acknowledgement of a read and its chunks", () => {
    expect(ShotsReadParamsSchema.safeParse({ path: "a/b.png" }).success).toBe(
      true
    )
    expect(ShotsReadResultSchema.safeParse(result).success).toBe(true)
    expect(
      ShotEventSchema.safeParse({
        id: 21,
        event: "shot",
        seq: 0,
        bytes: "iVBORw0KGgo=",
      }).success
    ).toBe(true)
  })

  it("rejects a media type outside the gallery, a bad digest and a capture beyond the cap", () => {
    expect(
      ShotsReadResultSchema.safeParse({ ...result, media_type: "text/plain" })
        .success
    ).toBe(false)
    expect(
      ShotsReadResultSchema.safeParse({ ...result, sha256: "NOTHEX" }).success
    ).toBe(false)
    expect(
      ShotsReadResultSchema.safeParse({
        ...result,
        size_bytes: SHOT_MAX_BYTES + 1,
      }).success
    ).toBe(false)
  })

  it("keeps the chunk cut on a multiple of three so base64 pads only the last one", () => {
    expect(SHOT_CHUNK_BYTES % 3).toBe(0)
  })
})
