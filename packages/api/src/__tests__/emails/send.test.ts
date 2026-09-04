import { describe, expect, it } from "bun:test"
import { EMAIL_FROM } from "../../emails/config"
import { deliver } from "../../emails/deliver"
import { buildMimeMessage } from "../../emails/mime"
import { cloudflareEmailBinding, createEmailSender } from "../../emails/send"

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

  it("porte les en-têtes que Cloudflare Email exige", () => {
    expect(mime).toContain(`From: ${EMAIL_FROM}`)
    expect(mime).toContain("To: ada@test.local")
    expect(mime).toContain("Message-ID: <abc@pupitre.studio>")
    expect(mime).toContain("MIME-Version: 1.0")
    expect(mime).toContain("Date: ")
  })

  it("encode un sujet non ASCII en base64 RFC 2047", () => {
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

  it("porte les deux parts, texte d'abord", () => {
    expect(mime).toContain("multipart/alternative")
    expect(mime.indexOf("text/plain")).toBeLessThan(mime.indexOf("text/html"))
    expect(partOf(mime, "text/plain")).toContain("https://app.pupitre.studio")
    expect(partOf(mime, "text/html")).toContain("<body>Bonjour</body>")
  })
})

describe("le transport", () => {
  it("ne trouve pas de binding EMAIL hors du Worker", async () => {
    expect(await cloudflareEmailBinding()).toBeNull()
  })

  it("retombe sur le journal quand le binding manque", async () => {
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
})

describe("deliver", () => {
  it("rend faux et ne jette pas quand l'envoi échoue", async () => {
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

  it("rend vrai quand l'envoi passe", async () => {
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
