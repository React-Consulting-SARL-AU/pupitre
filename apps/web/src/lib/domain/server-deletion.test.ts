import { describe, expect, it } from "bun:test"
import { deletionLook, purgeable } from "@/lib/domain/server-deletion"

describe("deleting a server", () => {
  it("revokes a server the platform still holds", () => {
    for (const status of ["enrolling", "active", "grace", "suspended"]) {
      expect(deletionLook(status).deletion).toBe("revoke")
    }
  })

  it("deletes an already revoked server", () => {
    expect(deletionLook("revoked").deletion).toBe("purge")
  })

  it("names the action by what it does, never by the same word twice", () => {
    expect(deletionLook("active").confirm).not.toBe(
      deletionLook("revoked").confirm
    )
    expect(deletionLook("revoked").description).toBe(
      "serverActions.purgeDescription"
    )
  })

  it("carries the deletion action only on a revoked row", () => {
    expect(purgeable("revoked")).toBe(true)

    for (const status of ["enrolling", "active", "grace", "suspended"]) {
      expect(purgeable(status)).toBe(false)
    }
  })
})
