import { describe, expect, it } from "bun:test"
import { translator } from "@/lib/i18n/i18n"
import {
  formatBytes,
  formatProduct,
  formatRatio,
  formatRelative,
  formatUsed,
  gigabytesToBytes,
} from "@/lib/utils/format"

const fr = translator("fr")
const en = translator("en")

describe("formatBytes", () => {
  it("climbs the units and keeps the numbers short", () => {
    expect(formatBytes(512, fr)).toBe("512 o")
    expect(formatBytes(2048, fr)).toBe("2,0 ko")
    expect(formatBytes(20 * 1024 * 1024, fr)).toBe("20 Mo")
  })

  it("names the units in the reader's language", () => {
    expect(formatBytes(512, en)).toBe("512 B")
    expect(formatBytes(20 * 1024 * 1024, en)).toBe("20 MB")
    expect(formatBytes(2048, en)).toBe("2.0 kB")
  })
})

describe("formatUsed", () => {
  it("says what is taken of what the machine holds", () => {
    expect(formatUsed(gigabytesToBytes(1.8), gigabytesToBytes(556), fr)).toBe(
      "1,8 Go / 556 Go"
    )
  })

  it("climbs to terabytes on a machine that has them", () => {
    expect(formatUsed(gigabytesToBytes(900), gigabytesToBytes(2048), en)).toBe(
      "900 GB / 2.0 TB"
    )
  })

  // An older agent sends no quantity: the percentage stands alone.
  it("says nothing when the agent measured nothing", () => {
    expect(formatUsed(null, gigabytesToBytes(556), fr)).toBeNull()
    expect(formatUsed(gigabytesToBytes(1), null, fr)).toBeNull()
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

describe("formatProduct", () => {
  it("names the products the console knows", () => {
    expect(formatProduct("granted", fr)).toBe("Accordée")
    expect(formatProduct("granted", en)).toBe("Granted")
  })

  it("calls a product only Stripe knows Stripe, and none nothing", () => {
    expect(formatProduct("prod_other", fr)).toBe("Stripe")
    expect(formatProduct("prod_server", en)).toBe("Stripe")
    expect(formatProduct(null, fr)).toBe("—")
  })
})
