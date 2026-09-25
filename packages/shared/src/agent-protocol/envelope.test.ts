import { describe, expect, it } from "bun:test"
import {
  EventSchema,
  LogEventSchema,
  PROTOCOL_VERSION,
  RequestSchema,
  ResponseSchema,
  StepEventSchema,
} from "./envelope"

describe("PROTOCOL_VERSION", () => {
  it("is the integer 2", () => {
    expect(PROTOCOL_VERSION).toBe(2)
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true)
  })
})

describe("RequestSchema", () => {
  it("accepts a request with and without params", () => {
    expect(
      RequestSchema.safeParse({
        id: 12,
        cmd: "project.up",
        params: { name: "flyleaf-api" },
      }).success
    ).toBe(true)
    expect(RequestSchema.safeParse({ id: 1, cmd: "ping" }).success).toBe(true)
  })

  it("rejects a non-integer id and a missing cmd", () => {
    expect(RequestSchema.safeParse({ id: "12", cmd: "ping" }).success).toBe(
      false
    )
    expect(RequestSchema.safeParse({ id: 1.5, cmd: "ping" }).success).toBe(
      false
    )
    expect(RequestSchema.safeParse({ id: 1 }).success).toBe(false)
  })
})

describe("EventSchema", () => {
  it("accepts an event carrying extra fields", () => {
    const parsed = EventSchema.safeParse({
      id: 12,
      event: "log",
      line: "vite v7 ready in 412 ms",
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.line).toBe("vite v7 ready in 412 ms")
  })

  it("rejects an event without a name", () => {
    expect(EventSchema.safeParse({ id: 12, line: "x" }).success).toBe(false)
  })
})

describe("LogEventSchema and StepEventSchema", () => {
  it("accept the documented log and step events", () => {
    expect(
      LogEventSchema.safeParse({ id: 3, event: "log", line: "ready" }).success
    ).toBe(true)
    expect(
      StepEventSchema.safeParse({
        id: 3,
        event: "step",
        module: "db.postgres",
        step: "install",
        status: "ok",
        ms: 1200,
      }).success
    ).toBe(true)
    expect(
      StepEventSchema.safeParse({
        id: 3,
        event: "step",
        module: "db.postgres",
        step: "install",
        status: "fail",
        ms: 1200,
        replay: "sudo apt-get install -y postgresql-17",
      }).success
    ).toBe(true)
  })

  it("reject an unknown step status and a log without line", () => {
    expect(
      StepEventSchema.safeParse({
        id: 3,
        event: "step",
        module: "db.postgres",
        step: "install",
        status: "done",
        ms: 1,
      }).success
    ).toBe(false)
    expect(LogEventSchema.safeParse({ id: 3, event: "log" }).success).toBe(
      false
    )
  })
})

describe("ResponseSchema", () => {
  it("accepts a success and a failure", () => {
    expect(
      ResponseSchema.safeParse({
        id: 12,
        ok: true,
        result: { state: "online", port: 5173 },
      }).success
    ).toBe(true)
    expect(
      ResponseSchema.safeParse({
        id: 12,
        ok: false,
        error: {
          code: "project_not_found",
          message: "No project named flyleaf",
          fix: "dev project add flyleaf …",
        },
      }).success
    ).toBe(true)
  })

  it("rejects a failure without a stable code and a success with an error", () => {
    expect(
      ResponseSchema.safeParse({
        id: 12,
        ok: false,
        error: { code: "whatever", message: "…" },
      }).success
    ).toBe(false)
    expect(
      ResponseSchema.safeParse({
        id: 12,
        ok: false,
        error: { message: "…" },
      }).success
    ).toBe(false)
    expect(
      ResponseSchema.safeParse({
        id: 12,
        ok: true,
        error: { code: "bad_request", message: "…" },
      }).success
    ).toBe(false)
  })
})
