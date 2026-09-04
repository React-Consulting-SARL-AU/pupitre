import { describe, expect, it } from "bun:test"
import { statusLook } from "@/lib/domain/server-status"

describe("statusLook", () => {
  it("gives every status its own shape, so colour never carries the state alone", () => {
    expect(statusLook("active").shape).toBe("filled")
    expect(statusLook("enrolling").shape).toBe("breathing")
    expect(statusLook("grace").shape).toBe("hollow")
    expect(statusLook("suspended").shape).toBe("barred")
    expect(statusLook("revoked").shape).toBe("barred")

    const shapes = new Set(
      ["active", "enrolling", "grace", "suspended"].map(
        (status) => statusLook(status).shape
      )
    )

    expect(shapes.size).toBe(4)
  })

  it("says a stale server has no news, whatever its status", () => {
    const stale = statusLook("active", true)

    expect(stale.shape).toBe("hollow")
    expect(stale.label).toBe("Sans nouvelles")
  })

  it("falls back to the revoked look for an unknown status", () => {
    expect(statusLook("martian").shape).toBe("barred")
  })
})
