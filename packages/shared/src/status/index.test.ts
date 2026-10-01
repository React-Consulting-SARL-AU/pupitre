import { describe, expect, it } from "bun:test"
import {
  STATUS_STALE_AFTER_MINUTES,
  STATUS_STALE_AFTER_MS,
  statusFreshness,
} from "./index"

const NOW = new Date("2026-09-04T12:00:00.000Z")

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000)
}

describe("statusFreshness", () => {
  it("allows three heartbeat cycles before crying stale", () => {
    expect(STATUS_STALE_AFTER_MINUTES).toBe(15)
  })

  it("calls an observation younger than the threshold fresh", () => {
    expect(statusFreshness(minutesAgo(14), NOW)).toBe("fresh")
  })

  it("calls an observation exactly at the threshold fresh", () => {
    expect(
      statusFreshness(new Date(NOW.getTime() - STATUS_STALE_AFTER_MS), NOW)
    ).toBe("fresh")
  })

  it("calls an observation older than the threshold stale", () => {
    expect(statusFreshness(minutesAgo(16), NOW)).toBe("stale")
  })

  it("calls the absence of an observation unknown", () => {
    expect(statusFreshness(null, NOW)).toBe("unknown")
  })

  it("calls an unreadable date unknown", () => {
    expect(statusFreshness("pas une date", NOW)).toBe("unknown")
  })

  it("accepts an ISO date", () => {
    expect(statusFreshness(minutesAgo(60).toISOString(), NOW)).toBe("stale")
  })
})
