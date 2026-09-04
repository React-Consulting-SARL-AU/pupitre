import { describe, expect, it } from "bun:test"
import { createLoggingSendEmail, redactTokens } from "@pupitre/auth/emails"
import { renderMagicLinkEmail } from "../../emails/render"

const TOKEN = "b6f1d0c2a9e34f7c8d15e2b0a7c934ff"

const MAGIC_LINK = `https://app.pupitre.studio/api/auth/magic-link/verify?token=${TOKEN}&callbackURL=%2Fdashboard`

describe("redactTokens", () => {
  it("cache le jeton dans une URL nue", () => {
    expect(redactTokens(MAGIC_LINK)).toBe(
      "https://app.pupitre.studio/api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fdashboard"
    )
  })

  it("cache le jeton dans un attribut href", () => {
    const redacted = redactTokens(`<a href="${MAGIC_LINK}">Se connecter</a>`)

    expect(redacted).not.toContain(TOKEN)
    expect(redacted).toContain("token=[redacted]")
    expect(redacted).toContain('">Se connecter</a>')
  })
})

describe("le journal du lien magique", () => {
  it("ne porte jamais le jeton entier", async () => {
    const lines: string[] = []
    const sendEmail = createLoggingSendEmail((line) => lines.push(line))
    const email = await renderMagicLinkEmail({
      locale: "fr",
      url: MAGIC_LINK,
    })

    await sendEmail({
      to: "ada@test.local",
      subject: email.subject,
      text: email.text,
      html: email.html,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("ada@test.local")
    expect(lines[0]).toContain("token=[redacted]")

    for (const line of lines) {
      expect(line).not.toContain(TOKEN)
      expect(line).not.toContain(TOKEN.slice(0, 12))
    }
  })

  it("ne journalise pas le corps HTML, qui porte le lien deux fois", async () => {
    const lines: string[] = []
    const sendEmail = createLoggingSendEmail((line) => lines.push(line))
    const email = await renderMagicLinkEmail({
      locale: "fr",
      url: MAGIC_LINK,
    })

    await sendEmail({
      to: "ada@test.local",
      subject: email.subject,
      text: email.text,
      html: email.html,
    })

    expect(lines[0]).not.toContain("<html")
  })
})
