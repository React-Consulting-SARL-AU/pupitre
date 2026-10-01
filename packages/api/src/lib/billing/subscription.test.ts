import { describe, expect, it } from "bun:test"
import { liveAmong } from "./subscription"

const GRANTED = { id: "granted", status: "active" }

const PAID = { id: "paid", status: "past_due" }

const CANCELED = { id: "canceled", status: "canceled" }

describe("liveAmong", () => {
  it("takes the last touched live row, past a canceled one touched later", () => {
    expect(liveAmong([CANCELED, GRANTED, PAID])?.id).toBe("granted")
    expect(liveAmong([CANCELED, PAID])?.id).toBe("paid")
  })

  it("falls back on the last row touched when nothing is live", () => {
    expect(liveAmong([CANCELED])?.id).toBe("canceled")
    expect(liveAmong([])).toBeNull()
  })
})
