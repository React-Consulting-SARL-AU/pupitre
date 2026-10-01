import { describe, expect, it } from "bun:test"
import {
  AuthEmailsNotConfiguredError,
  authEmailRenderer,
  configureAuthEmails,
  configuredSendEmail,
  createLoggingSendEmail,
  type EmailMessage,
  redactTokens,
} from "./emails"

const MAGIC_LINK =
  "https://app.pupitre.studio/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fdashboard"

const LOCAL_MAGIC_LINK =
  "http://localhost:3000/api/auth/magic-link/verify?token=abc123&callbackURL=%2Fdashboard"

describe("redactTokens", () => {
  it("hides token query values and nothing else", () => {
    expect(redactTokens(`open ${MAGIC_LINK} now`)).toBe(
      "open https://app.pupitre.studio/api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fdashboard now"
    )
  })

  it("keeps the token of a link to a console on this machine, the only way to sign in locally without mail", () => {
    expect(redactTokens(`open ${LOCAL_MAGIC_LINK} now`)).toBe(
      `open ${LOCAL_MAGIC_LINK} now`
    )
    expect(redactTokens("http://127.0.0.1:3000/verify?token=abc123")).toContain(
      "token=abc123"
    )
  })

  it("still hides a token on a host that only starts like localhost", () => {
    expect(
      redactTokens("https://localhost.attacker.example/verify?token=abc123")
    ).toContain("token=[redacted]")
  })

  it("stops at the quote that closes an href", () => {
    const redacted = redactTokens(`<a href="${MAGIC_LINK}">Entrer</a>`)

    expect(redacted).not.toContain("abc123")
    expect(redacted).toContain('">Entrer</a>')
  })
})

describe("createLoggingSendEmail", () => {
  it("logs the recipient and the link without the token", async () => {
    const lines: string[] = []
    const sendEmail = createLoggingSendEmail((line) => lines.push(line))

    await sendEmail({
      to: "ada@test.local",
      subject: "Votre lien de connexion Pupitre",
      text: `Connectez-vous : ${MAGIC_LINK}`,
      html: `<a href="${MAGIC_LINK}">Entrer</a>`,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("ada@test.local")
    expect(lines[0]).toContain("/api/auth/magic-link/verify?token=[redacted]")
    expect(lines[0]).not.toContain("abc123")
    expect(lines[0]).not.toContain("<a href")
  })
})

describe("the template port", () => {
  it("refuses to compose until someone has filled it", () => {
    expect(() => authEmailRenderer()).toThrow(AuthEmailsNotConfiguredError)
  })

  it("returns the registered template and remembers the sender", async () => {
    const sent: EmailMessage[] = []

    configureAuthEmails({
      renderer: {
        magicLink: (input) =>
          Promise.resolve({
            to: input.to,
            subject: "Lien",
            text: input.url,
            html: `<a href="${input.url}">Lien</a>`,
          }),
        invitation: (input) =>
          Promise.resolve({
            to: input.to,
            subject: `Invitation ${input.organizationName}`,
            text: input.url,
          }),
        emailChange: (input) =>
          Promise.resolve({
            to: input.to,
            subject: `Adresse ${input.newEmail}`,
            text: input.url,
          }),
        emailVerification: (input) =>
          Promise.resolve({
            to: input.to,
            subject: "Confirmation d'adresse",
            text: input.url,
          }),
      },
      sendEmail: (message) => {
        sent.push(message)

        return Promise.resolve()
      },
    })

    const renderer = authEmailRenderer()
    const magic = await renderer.magicLink({
      to: "ada@test.local",
      url: MAGIC_LINK,
      acceptLanguage: "fr",
    })

    expect(magic.html).toContain(MAGIC_LINK)

    const invitation = await renderer.invitation({
      to: "guest@test.local",
      url: "https://x/auth/invitation/inv_1",
      organizationName: "Acme",
      inviterEmail: "owner@test.local",
      acceptLanguage: null,
    })

    expect(invitation.subject).toContain("Acme")

    const sender = configuredSendEmail()

    expect(sender).not.toBeNull()

    await sender?.(magic)

    expect(sent).toHaveLength(1)
  })
})
