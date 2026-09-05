import { describe, expect, it } from "bun:test"
import { translator } from "@/lib/i18n/i18n"
import { formatBytes, formatRatio, formatRelative } from "@/lib/utils/format"

const fr = translator("fr")
const en = translator("en")

describe("formatBytes", () => {
  it("climbs the units and keeps the numbers short", () => {
    expect(formatBytes(512, fr)).toBe("512 o")
    expect(formatBytes(2048, fr)).toBe("2.0 ko")
    expect(formatBytes(20 * 1024 * 1024, fr)).toBe("20 Mo")
  })

  it("names the units in the reader's language", () => {
    expect(formatBytes(512, en)).toBe("512 B")
    expect(formatBytes(20 * 1024 * 1024, en)).toBe("20 MB")
  })
})

describe("formatRatio", () => {
  it("rounds to a whole percentage, spaced the French way", () => {
    expect(formatRatio(0.421, fr)).toBe("42 %")
    expect(formatRatio(0.421, en)).toBe("42%")
  })
})

describe("formatRelative", () => {
  const now = new Date("2026-09-04T12:00:00.000Z")

  it("says never when nothing was ever heard", () => {
    expect(formatRelative(null, fr, now)).toBe("jamais")
    expect(formatRelative(null, en, now)).toBe("never")
  })

  it("reads the distance in the largest unit that fits", () => {
    expect(formatRelative("2026-09-04T11:59:30.000Z", fr, now)).toBe(
      "à l'instant"
    )
    expect(formatRelative("2026-09-04T11:40:00.000Z", fr, now)).toBe(
      "il y a 20 min"
    )
    expect(formatRelative("2026-09-04T09:00:00.000Z", fr, now)).toBe(
      "il y a 3 h"
    )
    expect(formatRelative("2026-09-01T12:00:00.000Z", fr, now)).toBe(
      "il y a 3 j"
    )
  })

  it("speaks English when the translator does", () => {
    expect(formatRelative("2026-09-04T11:40:00.000Z", en, now)).toBe(
      "20 min ago"
    )
  })
})
