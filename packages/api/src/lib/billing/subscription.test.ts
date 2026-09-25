import { describe, expect, it } from "bun:test"
import { liveAmong } from "./subscription"

const KEPT_SEAT = {
  id: "kept",
  product: "launch",
  status: "active",
  currentPeriodEnd: null,
}

const PAID = {
  id: "paid",
  product: "prod_server",
  status: "active",
  currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
}

const CANCELED = {
  id: "canceled",
  product: "prod_server",
  status: "canceled",
  currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
}

describe("liveAmong", () => {
  it("prefers a paid subscription over the launch seat kept for good, whichever was touched last", () => {
    expect(liveAmong([KEPT_SEAT, PAID])?.id).toBe("paid")
    expect(liveAmong([PAID, KEPT_SEAT])?.id).toBe("paid")
  })

  it("falls back on the kept launch seat when nothing else is live", () => {
    expect(liveAmong([CANCELED, KEPT_SEAT])?.id).toBe("kept")
  })

  it("falls back on the last row touched when nothing is live", () => {
    expect(liveAmong([CANCELED])?.id).toBe("canceled")
    expect(liveAmong([])).toBeNull()
  })

  it("treats a running launch, which still has an end, as any live row", () => {
    const running = {
      ...KEPT_SEAT,
      id: "running",
      status: "trialing",
      currentPeriodEnd: new Date("2026-12-31T23:59:59Z"),
    }

    expect(liveAmong([running, PAID])?.id).toBe("running")
  })
})
