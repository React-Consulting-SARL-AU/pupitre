import { describe, expect, it } from "bun:test"
import { formatBytes, formatRatio, formatRelative } from "@/lib/utils/format"

describe("formatBytes", () => {
  it("climbs the units and keeps the numbers short", () => {
    expect(formatBytes(512)).toBe("512 o")
    expect(formatBytes(2048)).toBe("2.0 ko")
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 Mo")
  })
})

describe("formatRatio", () => {
  it("rounds to a whole percentage", () => {
    expect(formatRatio(0.421)).toBe("42 %")
  })
})

describe("formatRelative", () => {
  const now = new Date("2026-09-04T12:00:00.000Z")

  it("says never when nothing was ever heard", () => {
    expect(formatRelative(null, now)).toBe("jamais")
  })

  it("reads the distance in the largest unit that fits", () => {
    expect(formatRelative("2026-09-04T11:59:30.000Z", now)).toBe("à l'instant")
    expect(formatRelative("2026-09-04T11:40:00.000Z", now)).toBe(
      "il y a 20 min"
    )
    expect(formatRelative("2026-09-04T09:00:00.000Z", now)).toBe("il y a 3 h")
    expect(formatRelative("2026-09-01T12:00:00.000Z", now)).toBe("il y a 3 j")
  })
})
