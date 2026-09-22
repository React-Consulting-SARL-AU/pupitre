import { describe, expect, it } from "bun:test"
import { nextFixed, nextRolling, shardOf } from "./rate-limit"

const WINDOW_MS = 10_000

describe("nextFixed", () => {
  it("counts up inside a window and starts over once it has passed", () => {
    const first = nextFixed(undefined, WINDOW_MS, 1000)
    const second = nextFixed(
      { count: first.count, at: first.startedAt, expiresAt: first.expiresAt },
      WINDOW_MS,
      2000
    )
    const windowGone = nextFixed(
      { count: 300, at: 1000, expiresAt: 1000 + WINDOW_MS },
      WINDOW_MS,
      1000 + WINDOW_MS + 1
    )

    expect(first).toEqual({ count: 1, startedAt: 1000, expiresAt: 11_000 })
    expect(second).toEqual({ count: 2, startedAt: 1000, expiresAt: 11_000 })
    expect(windowGone).toEqual({
      count: 1,
      startedAt: 1000 + WINDOW_MS + 1,
      expiresAt: 2 * WINDOW_MS + 1001,
    })
  })
})

describe("nextRolling", () => {
  it("allows until the maximum, then refuses until the window frees up", () => {
    const first = nextRolling(undefined, 10, 3, 1000)
    const second = nextRolling(
      { count: first.count, at: first.lastRequest, expiresAt: 11_000 },
      10,
      3,
      2000
    )
    const third = nextRolling(
      { count: second.count, at: second.lastRequest, expiresAt: 12_000 },
      10,
      3,
      3000
    )
    const refused = nextRolling(
      { count: third.count, at: third.lastRequest, expiresAt: 13_000 },
      10,
      3,
      4000
    )

    expect(first).toEqual({
      count: 1,
      lastRequest: 1000,
      allowed: true,
      retryAfter: null,
    })
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(true)
    expect(refused).toEqual({
      count: 3,
      lastRequest: 3000,
      allowed: false,
      retryAfter: 9,
    })
  })

  it("resets once a whole window has passed since the last request", () => {
    const reset = nextRolling(
      { count: 3, at: 1000, expiresAt: 11_000 },
      10,
      3,
      11_001
    )

    expect(reset).toEqual({
      count: 1,
      lastRequest: 11_001,
      allowed: true,
      retryAfter: null,
    })
  })
})

describe("shardOf", () => {
  it("spreads keys over the shards and keeps one key on one shard", () => {
    const shards = new Set(
      Array.from({ length: 100 }, (_, index) => shardOf(`key-${index}`))
    )

    expect(shards.size).toBeGreaterThan(1)
    expect(shardOf("the-same-key")).toBe(shardOf("the-same-key"))
  })
})
