import { describe, expect, it } from "bun:test"
import { parseEmail, safeFilename } from "./parse"

function raw(lines: string[]): ArrayBuffer {
  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

const HUMAN_EML = [
  "From: Camille Dupont <Camille@Exemple.fr>",
  "To: support@pupitre.studio",
  "Cc: Equipe <equipe@exemple.fr>, legal@pupitre.studio",
  "Subject: Re: Mon serveur ne repond plus",
  "Message-ID: <camille-1@exemple.fr>",
  "In-Reply-To: <pupitre-0@pupitre.studio>",
  "References: <pupitre-0@pupitre.studio>",
  "Date: Thu, 18 Sep 2026 09:00:00 +0000",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "--mix",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Bonjour, le serveur ne repond plus depuis ce matin.",
  "",
  "--alt",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<p>Bonjour, le serveur ne repond plus.</p>",
  "",
  "--alt--",
  "",
  "--mix",
  'Content-Type: text/plain; name="journal.txt"',
  'Content-Disposition: attachment; filename="journal.txt"',
  "Content-Transfer-Encoding: base64",
  "",
  btoa("erreur 502"),
  "",
  "--mix--",
  "",
]

const AUTOMATED_EML = [
  "From: Infolettre <news@exemple.fr>",
  "To: support@pupitre.studio",
  "Subject: La lettre de septembre",
  "Message-ID: <news-9@exemple.fr>",
  "List-Unsubscribe: <https://exemple.fr/stop>",
  "Precedence: bulk",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Voici les nouveautes.",
  "",
]

describe("parseEmail", () => {
  it("reads the sender, the recipients, both bodies and the attachment", async () => {
    const parsed = await parseEmail(raw(HUMAN_EML))

    expect(parsed).not.toBeNull()
    expect(parsed?.fromEmail).toBe("camille@exemple.fr")
    expect(parsed?.fromName).toBe("Camille Dupont")
    expect(parsed?.to).toEqual(["support@pupitre.studio"])
    expect(parsed?.cc).toEqual(["equipe@exemple.fr", "legal@pupitre.studio"])
    expect(parsed?.subject).toBe("Re: Mon serveur ne repond plus")
    expect(parsed?.text).toContain("le serveur ne repond plus")
    expect(parsed?.html).toContain("<p>")
    expect(parsed?.automated).toBe(false)
  })

  it("strips the angle brackets of message identifiers", async () => {
    const parsed = await parseEmail(raw(HUMAN_EML))

    expect(parsed?.messageId).toBe("camille-1@exemple.fr")
    expect(parsed?.inReplyTo).toBe("pupitre-0@pupitre.studio")
    expect(parsed?.references).toBe("<pupitre-0@pupitre.studio>")
  })

  it("returns the attachment's bytes", async () => {
    const parsed = await parseEmail(raw(HUMAN_EML))
    const attachment = parsed?.attachments[0]

    expect(attachment?.filename).toBe("journal.txt")
    expect(attachment?.mimeType).toBe("text/plain")
    expect(new TextDecoder().decode(attachment?.content)).toBe("erreur 502")
  })

  it("recognizes an automatic message", async () => {
    const parsed = await parseEmail(raw(AUTOMATED_EML))

    expect(parsed?.automated).toBe(true)
    expect(parsed?.attachments).toEqual([])
    expect(parsed?.html).toBeNull()
  })
})

describe("safeFilename", () => {
  it("strips the path and the characters that are not valid", () => {
    expect(safeFilename("../../etc/pas de chance.txt")).toBe(
      "pas_de_chance.txt"
    )
  })

  it("names an anonymous attachment", () => {
    expect(safeFilename(null)).toBe("attachment")
  })
})
