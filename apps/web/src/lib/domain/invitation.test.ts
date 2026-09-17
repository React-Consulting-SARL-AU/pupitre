import { describe, expect, it } from "bun:test"
import { invitationRefusalOf } from "@/lib/domain/invitation"

describe("invitationRefusalOf", () => {
  it("names the wrong address when the session is not the invitee", () => {
    expect(
      invitationRefusalOf("YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION")
    ).toEqual({
      title: "auth.invitation.wrongEmail",
      fix: "auth.invitation.wrongEmailFix",
    })
  })

  it("falls back to the expired sentence otherwise", () => {
    expect(invitationRefusalOf("INVITATION_NOT_FOUND")).toEqual({
      title: "auth.invitation.failed",
      fix: "auth.invitation.failedFix",
    })
    expect(invitationRefusalOf(undefined).title).toBe("auth.invitation.failed")
  })
})
