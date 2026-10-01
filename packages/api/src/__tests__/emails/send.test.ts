import { describe, expect, it } from "bun:test"
import { EMAIL_FROM } from "../../emails/config"
import { deliver } from "../../emails/deliver"
import { buildMimeMessage } from "../../emails/mime"
import {
  cloudflareEmailBinding,
  createEmailSender,
  EmailBindingMissingError,
} from "../../emails/send"

function partOf(mime: string, contentType: string): string {
  const start = mime.indexOf(contentType)

  expect(start).toBeGreaterThan(-1)

  const body = mime.slice(mime.indexOf("\r\n\r\n", start) + 4)
  const end = body.indexOf("\r\n--")

  return Buffer.from(
    (end === -1 ? body : body.slice(0, end)).replace(/\r\n/g, ""),
    "base64"
  ).toString("utf8")
}

describe("buildMimeMessage", () => {
  const mime = buildMimeMessage({
    from: EMAIL_FROM,
    to: "ada@test.local",
    subject: "Votre lien de connexion Pupitre",
    text: "Ouvrez ce lien : https://app.pupitre.studio",
    html: "<html><body>Bonjour</body></html>",
    messageId: "<abc@pupitre.studio>",
    date: new Date("2026-09-04T10:00:00Z"),
  })

  it("carries the headers Cloudflare Email requires", () => {
    expect(mime).toContain(`From: ${EMAIL_FROM}`)
    expect(mime).toContain("To: ada@test.local")
    expect(mime).toContain("Message-ID: <abc@pupitre.studio>")
    expect(mime).toContain("MIME-Version: 1.0")
    expect(mime).toContain("Date: ")
  })

  it("encodes a non-ASCII subject in base64 RFC 2047", () => {
    const accented = buildMimeMessage({
      from: EMAIL_FROM,
      to: "ada@test.local",
      subject: "Votre serveur est prêt",
      text: "prêt",
      html: "<p>prêt</p>",
      messageId: "<x@pupitre.studio>",
      date: new Date("2026-09-04T10:00:00Z"),
    })

    expect(accented).toContain("Subject: =?UTF-8?B?")
    expect(accented).not.toContain("Subject: Votre serveur est prêt")
  })

  it("carries both parts, text first", () => {
    expect(mime).toContain("multipart/alternative")
    expect(mime.indexOf("text/plain")).toBeLessThan(mime.indexOf("text/html"))
    expect(partOf(mime, "text/plain")).toContain("https://app.pupitre.studio")
    expect(partOf(mime, "text/html")).toContain("<body>Bonjour</body>")
  })
})

describe("the transport", () => {
  it("finds no EMAIL binding outside the Worker", async () => {
    expect(await cloudflareEmailBinding()).toBeNull()
  })

  it("falls back to the log when the binding is missing", async () => {
    const lines: string[] = []
    const send = createEmailSender((line) => lines.push(line))

    await send({
      to: "ada@test.local",
      subject: "Bonjour",
      text: "Bonjour",
      html: "<p>Bonjour</p>",
    })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("ada@test.local")
  })

  it("refuses to send in production when the binding is missing", async () => {
    const lines: string[] = []
    const send = createEmailSender(
      (line) => lines.push(line),
      () =>
        Promise.resolve({
          binding: null,
          Message: null,
          environment: "production",
        })
    )

    await expect(
      send({
        to: "ada@test.local",
        subject: "Bonjour",
        text: "Bonjour",
        html: "<p>Bonjour</p>",
      })
    ).rejects.toBeInstanceOf(EmailBindingMissingError)
    expect(lines).toHaveLength(0)
  })

  it("logs outside production when the binding is missing", async () => {
    const lines: string[] = []
    const send = createEmailSender(
      (line) => lines.push(line),
      () => Promise.resolve({ binding: null, Message: null, environment: null })
    )

    await send({
      to: "ada@test.local",
      subject: "Bonjour",
      text: "Bonjour",
      html: "<p>Bonjour</p>",
    })

    expect(lines).toHaveLength(1)
  })
})

describe("deliver", () => {
  it("returns false and does not throw when sending fails", async () => {
    const failures: unknown[] = []
    const delivered = await deliver(
      {
        to: "ada@test.local",
        subject: "Bonjour",
        text: "Bonjour",
        html: "<p>Bonjour</p>",
      },
      {
        send: () => Promise.reject(new Error("SMTP down")),
        onFailure: (error) => failures.push(error),
      }
    )

    expect(delivered).toBe(false)
    expect(failures).toHaveLength(1)
  })

  it("returns true when sending succeeds", async () => {
    const sent: string[] = []
    const delivered = await deliver(
      {
        to: "ada@test.local",
        subject: "Bonjour",
        text: "Bonjour",
        html: "<p>Bonjour</p>",
      },
      {
        send: (message) => {
          sent.push(message.to)

          return Promise.resolve()
        },
      }
    )

    expect(delivered).toBe(true)
    expect(sent).toEqual(["ada@test.local"])
  })
})
