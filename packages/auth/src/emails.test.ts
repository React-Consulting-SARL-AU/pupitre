import { describe, expect, it } from "bun:test"
import {
  createLoggingSendEmail,
  invitationEmail,
  magicLinkEmail,
  redactTokens,
} from "./emails"

describe("redactTokens", () => {
  it("hides token query values and nothing else", () => {
    expect(
      redactTokens(
        "open http://localhost:3000/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fdashboard now"
      )
    ).toBe(
      "open http://localhost:3000/api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fdashboard now"
    )
  })
})

describe("createLoggingSendEmail", () => {
  it("logs the recipient and the link without the token", async () => {
    const lines: string[] = []
    const sendEmail = createLoggingSendEmail((line) => lines.push(line))

    await sendEmail(
      magicLinkEmail(
        "ada@test.local",
        "http://localhost:3000/api/auth/magic-link/verify?token=secret-token&callbackURL=%2F"
      )
    )

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("ada@test.local")
    expect(lines[0]).toContain("/api/auth/magic-link/verify?token=[redacted]")
    expect(lines[0]).not.toContain("secret-token")
  })
})

describe("messages", () => {
  it("carry the link and the organization", () => {
    const magic = magicLinkEmail("ada@test.local", "https://x/verify?token=t")

    expect(magic.to).toBe("ada@test.local")
    expect(magic.text).toContain("https://x/verify?token=t")

    const invitation = invitationEmail({
      to: "guest@test.local",
      url: "https://x/auth/invitation/inv_1",
      organizationName: "Acme",
      inviterEmail: "owner@test.local",
    })

    expect(invitation.subject).toContain("Acme")
    expect(invitation.text).toContain("https://x/auth/invitation/inv_1")
    expect(invitation.text).toContain("owner@test.local")
  })
})
