import { describe, expect, it } from "bun:test"
import { COMMAND_NAMES, type CommandName } from "./index"
import { COMMAND_TIMEOUTS_MS, DEFAULT_TIMEOUT_MS, timeoutOf } from "./timeouts"

describe("command timeouts", () => {
  it("name only commands of the contract", () => {
    const named = Object.keys(COMMAND_TIMEOUTS_MS) as CommandName[]

    for (const cmd of named) {
      expect(COMMAND_NAMES).toContain(cmd)
    }
  })

  it("give the default to what they do not name", () => {
    expect(timeoutOf("doctor")).toBe(DEFAULT_TIMEOUT_MS)
  })

  it("let an installation run to the end of a slow mirror", () => {
    expect(timeoutOf("install")).toBeGreaterThan(timeoutOf("snapshot"))
    expect(timeoutOf("harden")).toBe(timeoutOf("install"))
  })
})
