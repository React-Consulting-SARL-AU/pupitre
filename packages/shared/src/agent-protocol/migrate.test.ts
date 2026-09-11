import { describe, expect, it } from "bun:test"
import { AgentMigrateResultSchema, ConfigRevisionSchema } from "./migrate"

describe("ConfigRevision", () => {
  it("reads a machine that is where its binary expects it", () => {
    const parsed = ConfigRevisionSchema.parse({
      expected: 4,
      revision: 4,
      state: "current",
    })

    expect(parsed.state).toBe("current")
  })

  it("refuses a state nobody defined", () => {
    expect(
      ConfigRevisionSchema.safeParse({
        expected: 4,
        revision: 3,
        state: "halfway",
      }).success
    ).toBe(false)
  })

  it("refuses a revision that counts backwards", () => {
    expect(
      ConfigRevisionSchema.safeParse({
        expected: 4,
        revision: -1,
        state: "pending",
      }).success
    ).toBe(false)
  })
})

describe("AgentMigrateResult", () => {
  it("takes a call that had nothing left to do", () => {
    const parsed = AgentMigrateResultSchema.parse({
      applied: [],
      expected: 4,
      pending: [],
      revision: 4,
      state: "current",
    })

    expect(parsed.applied).toEqual([])
    expect(parsed.restored).toBe(false)
  })

  it("carries what ran, and where the previous files went", () => {
    const parsed = AgentMigrateResultSchema.parse({
      applied: [{ id: 4, ms: 12, slug: "split-exposure" }],
      backup: "1789-r3",
      expected: 4,
      pending: [],
      revision: 4,
      state: "current",
    })

    expect(parsed.applied[0]?.slug).toBe("split-exposure")
    expect(parsed.backup).toBe("1789-r3")
  })

  it("names the migration that refused, and what is still owed", () => {
    const parsed = AgentMigrateResultSchema.parse({
      applied: [],
      backup: "1789-r3",
      expected: 5,
      failure: { id: 4, message: "install.json unreadable", slug: "split" },
      pending: [4, 5],
      restored: true,
      revision: 3,
      state: "failed",
    })

    expect(parsed.failure?.id).toBe(4)
    expect(parsed.pending).toEqual([4, 5])
    expect(parsed.restored).toBe(true)
  })
})
