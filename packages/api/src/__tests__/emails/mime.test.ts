import { describe, expect, it } from "bun:test"
import { buildMimeMessage } from "../../emails/mime"

const HEADER_BLOCK_END = "\r\n\r\n"

const BOUNDARY_RE = /boundary="([^"]+)"/

function headerLines(raw: string): string[] {
  return raw.slice(0, raw.indexOf(HEADER_BLOCK_END)).split("\r\n")
}

function base(): Parameters<typeof buildMimeMessage>[0] {
  return {
    from: "support@pupitre.studio",
    to: ["camille@exemple.fr"],
    subject: "Re: Mon serveur",
    text: "Bonjour",
    html: "<div>Bonjour</div>",
  }
}

describe("buildMimeMessage", () => {
  it("ne laisse pas un References hostile ajouter un en-tête", () => {
    const raw = buildMimeMessage({
      ...base(),
      references: "<a@x>\r\nBcc: attaquant@exemple.fr\r\nX-Injecte: oui",
    })

    expect(raw).not.toContain("\r\nBcc:")
    expect(raw).not.toContain("\r\nX-Injecte:")
    expect(headerLines(raw)).toContain(
      "References: <a@x> Bcc: attaquant@exemple.fr X-Injecte: oui"
    )
  })

  it("ne laisse pas un In-Reply-To hostile ajouter un en-tête", () => {
    const raw = buildMimeMessage({
      ...base(),
      inReplyTo: "<racine@x>\r\nBcc: attaquant@exemple.fr",
    })

    expect(raw).not.toContain("\r\nBcc:")
    expect(
      headerLines(raw).filter((line) => line.startsWith("In-Reply-To:"))
    ).toHaveLength(1)
  })

  it("ne laisse pas un Message-ID hostile ajouter un en-tête", () => {
    const raw = buildMimeMessage({
      ...base(),
      messageId: "<abc@pupitre.studio>\r\nBcc: attaquant@exemple.fr",
    })

    expect(raw).not.toContain("\r\nBcc:")
    expect(
      headerLines(raw).filter((line) => line.startsWith("Message-ID:"))
    ).toHaveLength(1)
  })

  it("reste en multipart/alternative sans pièce jointe", () => {
    const raw = buildMimeMessage(base())

    expect(headerLines(raw).join("\n")).toContain(
      "Content-Type: multipart/alternative"
    )
    expect(raw).not.toContain("multipart/mixed")
  })

  it("enveloppe le texte et le HTML dans un multipart/mixed avec chaque pièce jointe en base64", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff])
    const raw = buildMimeMessage({
      ...base(),
      attachments: [
        {
          filename: "rapport.pdf",
          contentType: "application/pdf",
          content: bytes.buffer as ArrayBuffer,
        },
        {
          filename: "notes.txt",
          contentType: "text/plain",
          content: new TextEncoder().encode("ok").buffer as ArrayBuffer,
        },
      ],
    })
    const outer = headerLines(raw).find((line) =>
      line.startsWith("Content-Type: multipart/mixed")
    )
    const outerBoundary = outer?.match(BOUNDARY_RE)?.[1] ?? ""
    const parts = raw.split(`--${outerBoundary}`)

    expect(outerBoundary).not.toBe("")
    expect(parts).toHaveLength(5)
    expect(parts[1]).toContain("Content-Type: multipart/alternative")
    expect(parts[1]).toContain("Content-Type: text/plain")
    expect(parts[1]).toContain("Content-Type: text/html")
    expect(parts[2]).toContain(
      'Content-Type: application/pdf; name="rapport.pdf"'
    )
    expect(parts[2]).toContain(
      'Content-Disposition: attachment; filename="rapport.pdf"'
    )
    expect(parts[2]).toContain("Content-Transfer-Encoding: base64")
    expect(parts[2]).toContain(btoa(String.fromCharCode(...bytes)))
    expect(parts[3]).toContain('filename="notes.txt"')
    expect(parts[3]).toContain(btoa("ok"))
    expect(parts[4].trim()).toBe("--")
  })

  it("ne laisse pas un nom de pièce jointe hostile fermer le paramètre ni ajouter un en-tête", () => {
    const raw = buildMimeMessage({
      ...base(),
      attachments: [
        {
          filename: 'a".pdf\r\nBcc: attaquant@exemple.fr',
          contentType: "application/pdf",
          content: new ArrayBuffer(0),
        },
      ],
    })

    expect(raw).not.toContain("\r\nBcc:")
    expect(raw).toContain('filename="a.pdfBcc: attaquant@exemple.fr"')
  })

  it("garde un en-tête légitime tel quel", () => {
    const raw = buildMimeMessage({
      ...base(),
      messageId: "<abc@pupitre.studio>",
      inReplyTo: "<racine@exemple.fr>",
      references: "<a@x> <b@x>",
    })
    const lines = headerLines(raw)

    expect(lines).toContain("Message-ID: <abc@pupitre.studio>")
    expect(lines).toContain("In-Reply-To: <racine@exemple.fr>")
    expect(lines).toContain("References: <a@x> <b@x>")
  })
})
