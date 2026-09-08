import { describe, expect, it } from "bun:test"
import { deletionLook, purgeable } from "@/lib/domain/server-deletion"

/**
 * What these tests prove: the console says which of the two steps it's
 * taking, and it only offers to erase a row where erasing makes sense — on
 * a server already revoked.
 */
describe("la suppression d'un serveur", () => {
  it("révoque un serveur que la plateforme tient encore", () => {
    for (const status of ["enrolling", "active", "grace", "suspended"]) {
      expect(deletionLook(status).deletion).toBe("revoke")
    }
  })

  it("efface un serveur déjà révoqué", () => {
    expect(deletionLook("revoked").deletion).toBe("purge")
  })

  it("nomme le geste par ce qu'il fait, jamais par le même mot deux fois", () => {
    expect(deletionLook("active").confirm).not.toBe(
      deletionLook("revoked").confirm
    )
    expect(deletionLook("revoked").description).toBe(
      "serverActions.purgeDescription"
    )
  })

  it("ne porte le geste d'effacement que sur une ligne révoquée", () => {
    expect(purgeable("revoked")).toBe(true)

    for (const status of ["enrolling", "active", "grace", "suspended"]) {
      expect(purgeable(status)).toBe(false)
    }
  })
})
