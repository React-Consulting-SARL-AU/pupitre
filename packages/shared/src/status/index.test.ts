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
  it("laisse trois cycles de heartbeat avant de crier au périmé", () => {
    expect(STATUS_STALE_AFTER_MINUTES).toBe(15)
  })

  it("dit fraîche une observation plus jeune que le seuil", () => {
    expect(statusFreshness(minutesAgo(14), NOW)).toBe("fresh")
  })

  it("dit fraîche une observation pile sur le seuil", () => {
    expect(
      statusFreshness(new Date(NOW.getTime() - STATUS_STALE_AFTER_MS), NOW)
    ).toBe("fresh")
  })

  it("dit périmée une observation plus vieille que le seuil", () => {
    expect(statusFreshness(minutesAgo(16), NOW)).toBe("stale")
  })

  it("dit inconnue l'absence d'observation", () => {
    expect(statusFreshness(null, NOW)).toBe("unknown")
  })

  it("dit inconnue une date illisible", () => {
    expect(statusFreshness("pas une date", NOW)).toBe("unknown")
  })

  it("accepte une date ISO", () => {
    expect(statusFreshness(minutesAgo(60).toISOString(), NOW)).toBe("stale")
  })
})
