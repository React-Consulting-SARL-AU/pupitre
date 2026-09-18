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
  it("lit l'expéditeur, les destinataires, les deux corps et la pièce jointe", async () => {
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

  it("retire les chevrons des identifiants de message", async () => {
    const parsed = await parseEmail(raw(HUMAN_EML))

    expect(parsed?.messageId).toBe("camille-1@exemple.fr")
    expect(parsed?.inReplyTo).toBe("pupitre-0@pupitre.studio")
    expect(parsed?.references).toBe("<pupitre-0@pupitre.studio>")
  })

  it("rend les octets de la pièce jointe", async () => {
    const parsed = await parseEmail(raw(HUMAN_EML))
    const attachment = parsed?.attachments[0]

    expect(attachment?.filename).toBe("journal.txt")
    expect(attachment?.mimeType).toBe("text/plain")
    expect(new TextDecoder().decode(attachment?.content)).toBe("erreur 502")
  })

  it("reconnaît un envoi automatique", async () => {
    const parsed = await parseEmail(raw(AUTOMATED_EML))

    expect(parsed?.automated).toBe(true)
    expect(parsed?.attachments).toEqual([])
    expect(parsed?.html).toBeNull()
  })
})

describe("safeFilename", () => {
  it("retire le chemin et les caractères qui n'en sont pas", () => {
    expect(safeFilename("../../etc/pas de chance.txt")).toBe(
      "pas_de_chance.txt"
    )
  })

  it("nomme une pièce jointe anonyme", () => {
    expect(safeFilename(null)).toBe("piece-jointe")
  })
})
