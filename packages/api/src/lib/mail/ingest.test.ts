import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import {
  MAIL_MAX_BYTES,
  MAIL_MAX_INBOUND_ATTACHMENTS,
  MAIL_MAX_REFERENCES,
  MAIL_MAX_TEXT_CHARS,
} from "@pupitre/shared/legal"
import { PLATFORM_MAILBOX_IDS } from "@pupitre/shared/platform"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  resetFakeMail,
  seedPlatformMailboxes,
  textOf,
  useFakeMail,
} from "../../testing/mail"
import { createUser } from "../../testing/session"
import { getPrisma } from "../api/prisma"
import {
  handleInboundEmailMessage,
  type InboundEmailMessage,
  ingestInboundEmail,
  MAIL_TOO_LARGE_REASON,
  THREAD_WINDOW_DAYS,
} from "./ingest"
import { configureMailStorage } from "./storage"

const DAY = 86_400_000

interface EmlInput {
  from?: string
  to?: string
  cc?: string
  subject?: string
  messageId?: string
  inReplyTo?: string
  references?: string
  text?: string
  html?: string
  extra?: string[]
  authenticated?: boolean
}

const SENDER_DOMAIN_RE = /@([^>\s]+)/

// The header Email Routing's MX prepends once DMARC passed for the `From` domain.
function cloudflareResults(from: string): string {
  const domain = from.match(SENDER_DOMAIN_RE)?.[1] ?? ""

  return `ARC-Authentication-Results: i=1; mx.cloudflare.net; dkim=pass header.d=${domain}; dmarc=pass header.from=${domain}; spf=pass smtp.mailfrom=${domain}`
}

function eml(input: EmlInput = {}): ArrayBuffer {
  const boundary = "alt"
  const from = input.from ?? "Camille <camille@exemple.fr>"
  const lines = [
    ...(input.authenticated === false ? [] : [cloudflareResults(from)]),
    `From: ${from}`,
    `To: ${input.to ?? "support@pupitre.studio"}`,
  ]

  if (input.cc) {
    lines.push(`Cc: ${input.cc}`)
  }

  if (input.subject !== "") {
    lines.push(`Subject: ${input.subject ?? "Mon serveur ne repond plus"}`)
  }

  lines.push(
    `Message-ID: <${input.messageId ?? crypto.randomUUID()}@exemple.fr>`
  )

  if (input.inReplyTo) {
    lines.push(`In-Reply-To: <${input.inReplyTo}>`)
  }

  if (input.references) {
    lines.push(`References: ${input.references}`)
  }

  lines.push(...(input.extra ?? []))
  lines.push(
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.text ?? "Bonjour, rien ne repond.",
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    input.html ?? "<p>Bonjour, rien ne repond.</p>",
    "",
    `--${boundary}--`,
    ""
  )

  return new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer
}

function emlWithAttachment(): ArrayBuffer {
  return new TextEncoder().encode(
    [
      "From: Camille <camille@exemple.fr>",
      "To: support@pupitre.studio",
      "Subject: Journal",
      "Message-ID: <piece@exemple.fr>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="mix"',
      "",
      "--mix",
      "Content-Type: text/html; charset=UTF-8",
      "",
      "<p>Bonjour, voici le journal.</p>",
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
    ].join("\r\n")
  ).buffer as ArrayBuffer
}

function ingest(raw: ArrayBuffer, now?: Date) {
  return ingestInboundEmail({
    envelopeFrom: "camille@exemple.fr",
    envelopeTo: "support@pupitre.studio",
    raw,
    now,
  })
}

describe("ingestInboundEmail", () => {
  let mail: ReturnType<typeof useFakeMail>

  beforeAll(async () => {
    await bootApiTestServer()
  })

  afterAll(() => {
    resetFakeMail()
  })

  beforeEach(async () => {
    await resetDb()
    mail = useFakeMail()
  })

  it("ouvre un fil, écrit le texte en base et le brut dans le seau", async () => {
    const result = await ingest(eml())

    expect(result.status).toBe("stored")
    expect(result.newThread).toBe(true)

    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
      include: { messages: true },
    })

    expect(thread.address).toBe("support@pupitre.studio")
    expect(thread.unread).toBe(true)
    expect(thread.lastInboundAt).not.toBeNull()
    expect(thread.messages[0].text).toContain("rien ne repond")
    expect(thread.messages[0].snippet).toContain("rien ne repond")
    expect(textOf(mail.objects.get(thread.messages[0].rawKey ?? ""))).toContain(
      "Subject:"
    )
    expect(
      textOf(mail.objects.get(thread.messages[0].htmlKey ?? ""))
    ).toContain("<p>Bonjour, rien ne repond.</p>")
  })

  it("range les pièces jointes dans le seau avec leur ligne", async () => {
    const raw = new TextEncoder().encode(
      [
        "From: Camille <camille@exemple.fr>",
        "To: support@pupitre.studio",
        "Subject: Journal",
        "Message-ID: <piece@exemple.fr>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="mix"',
        "",
        "--mix",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        "Voici le journal.",
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
      ].join("\r\n")
    ).buffer as ArrayBuffer

    const result = await ingest(raw)
    const attachment = await getPrisma().mailAttachment.findFirstOrThrow({
      where: { messageId: result.messageId },
    })

    expect(attachment.filename).toBe("journal.txt")
    expect(attachment.size).toBe(10)
    expect(attachment.key).toContain("/attachments/0/journal.txt")
    expect(textOf(mail.objects.get(attachment.key))).toBe("erreur 502")
  })

  it("refuse d'écrire deux fois le même message brut", async () => {
    const raw = eml({ messageId: "unique" })
    const first = await ingest(raw)
    const second = await ingest(raw)

    expect(second.status).toBe("duplicate")
    expect(second.messageId).toBe(first.messageId)
    expect(await getPrisma().mailMessage.count()).toBe(1)
  })

  it("reconnaît un doublon par son Message-ID malgré des octets différents", async () => {
    const first = await ingest(eml({ messageId: "meme-id", text: "un" }))
    const second = await ingest(eml({ messageId: "meme-id", text: "deux" }))

    expect(second.status).toBe("duplicate")
    expect(second.threadId).toBe(first.threadId)
  })

  it("range le même message écrit à deux de nos adresses dans deux fils, et reconnaît le renvoi de chacun", async () => {
    const raw = eml({
      messageId: "deux-boites",
      to: "support@pupitre.studio, legal@pupitre.studio",
    })

    const toSupport = await ingest(raw)
    const toLegal = await ingestInboundEmail({
      envelopeFrom: "camille@exemple.fr",
      envelopeTo: "legal@pupitre.studio",
      raw,
    })
    const replayed = await ingestInboundEmail({
      envelopeFrom: "camille@exemple.fr",
      envelopeTo: "legal@pupitre.studio",
      raw,
    })

    const prisma = getPrisma()
    const threads = await prisma.mailThread.findMany({
      orderBy: { address: "asc" },
      include: { _count: { select: { messages: true } } },
    })

    expect(toSupport.status).toBe("stored")
    expect(toLegal.status).toBe("stored")
    expect(toLegal.threadId).not.toBe(toSupport.threadId)
    expect(replayed.status).toBe("duplicate")
    expect(replayed.messageId).toBe(toLegal.messageId)
    expect(
      threads.map((thread) => [thread.address, thread._count.messages])
    ).toEqual([
      ["legal@pupitre.studio", 1],
      ["support@pupitre.studio", 1],
    ])
  })

  it("ne laisse aucun fil vide quand une livraison concurrente écrit le même message", async () => {
    const raw = eml({ messageId: "concurrent", subject: "Course" })
    const prisma = getPrisma()

    let raced = false

    configureMailStorage({
      ...mail.storage,
      put: async (key, body, contentType) => {
        if (!raced) {
          raced = true

          const other = await prisma.mailThread.create({
            data: {
              address: "support@pupitre.studio",
              subject: "Autre chemin",
              normalizedSubject: "autre chemin",
            },
          })

          await prisma.mailMessage.create({
            data: {
              threadId: other.id,
              direction: "inbound",
              fromEmail: "camille@exemple.fr",
              toEmails: [],
              ccEmails: [],
              messageId: "concurrent@exemple.fr",
              address: "support@pupitre.studio",
            },
          })
        }

        return await mail.storage.put(key, body, contentType)
      },
    })

    const result = await ingest(raw)

    expect(result.status).toBe("duplicate")
    expect(await prisma.mailThread.count()).toBe(1)
    expect(await prisma.mailMessage.count()).toBe(1)
  })

  it("rattache une réponse par In-Reply-To malgré un autre sujet", async () => {
    const first = await ingest(eml({ messageId: "racine" }))
    const second = await ingest(
      eml({
        subject: "Tout autre chose",
        inReplyTo: "racine@exemple.fr",
        from: "Autre <autre@exemple.fr>",
      })
    )

    expect(second.threadId).toBe(first.threadId)
    expect(second.newThread).toBe(false)
  })

  it("rattache par sujet normalisé quand le même correspondant écrit dans la fenêtre", async () => {
    const first = await ingest(eml({ subject: "Facture de septembre" }))
    const second = await ingest(eml({ subject: "Re: Facture de septembre" }))

    expect(second.threadId).toBe(first.threadId)
  })

  it("ouvre un fil neuf passé la fenêtre de trente jours", async () => {
    const first = await ingest(eml({ subject: "Facture de septembre" }))
    const later = new Date(Date.now() + (THREAD_WINDOW_DAYS + 10) * DAY)
    const second = await ingest(
      eml({ subject: "Re: Facture de septembre" }),
      later
    )

    expect(second.threadId).not.toBe(first.threadId)
    expect(second.newThread).toBe(true)
  })

  it("ouvre un fil neuf pour un autre correspondant sur le même sujet", async () => {
    const first = await ingest(eml({ subject: "Bonjour" }))
    const second = await ingest(
      eml({ subject: "Bonjour", from: "Autre <autre@exemple.fr>" })
    )

    expect(second.threadId).not.toBe(first.threadId)
  })

  it("range un envoi automatique sans marquer le fil non lu", async () => {
    const result = await ingest(
      eml({ extra: ["List-Unsubscribe: <https://exemple.fr/stop>"] })
    )
    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
    })

    expect(result.status).toBe("stored")
    expect(thread.unread).toBe(false)
    expect(thread.lastInboundAutomated).toBe(true)
  })

  it("rattache le fil à la boîte qui déclare l'adresse", async () => {
    await seedPlatformMailboxes()

    const result = await ingest(eml())
    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
    })

    expect(thread.mailboxId).toBe(PLATFORM_MAILBOX_IDS.support)
    expect(mail.broadcast).toContainEqual({
      type: "thread.received",
      thread_id: result.threadId,
      mailbox_id: PLATFORM_MAILBOX_IDS.support,
    })
  })

  it("laisse le fil sans boîte quand aucune ne déclare l'adresse", async () => {
    await seedPlatformMailboxes()

    const result = await ingestInboundEmail({
      envelopeFrom: "camille@exemple.fr",
      envelopeTo: "jordan@pupitre.studio",
      raw: eml({ to: "jordan@pupitre.studio" }),
    })
    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
    })

    expect(thread.address).toBe("jordan@pupitre.studio")
    expect(thread.mailboxId).toBeNull()
  })

  it("nomme le correspondant quand l'adresse est celle d'un compte", async () => {
    const { user } = await createUser({ email: "camille@exemple.fr" })
    const result = await ingest(eml())
    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
    })

    expect(thread.contactUserId).toBe(user.id)
    expect(thread.senderAuthenticated).toBe(true)
  })

  it("ne relie pas un compte à un expéditeur que personne n'a vérifié", async () => {
    await createUser({ email: "camille@exemple.fr" })

    const result = await ingest(eml({ authenticated: false }))
    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
      include: { messages: true },
    })

    expect(thread.contactUserId).toBeNull()
    expect(thread.senderEmail).toBe("camille@exemple.fr")
    expect(thread.senderAuthenticated).toBe(false)
    expect(thread.messages[0].authenticated).toBe(false)
  })

  it("n'ouvre pas un fil existant à un expéditeur non vérifié qui en reprend le sujet", async () => {
    const first = await ingest(eml({ subject: "Facture de septembre" }))
    const second = await ingest(
      eml({ subject: "Re: Facture de septembre", authenticated: false })
    )

    expect(second.threadId).not.toBe(first.threadId)
  })

  it("rattache quand même par ses références un expéditeur non vérifié", async () => {
    const first = await ingest(eml({ messageId: "racine-verifiee" }))
    const second = await ingest(
      eml({ inReplyTo: "racine-verifiee@exemple.fr", authenticated: false })
    )

    expect(second.threadId).toBe(first.threadId)
  })

  it("range un message sans objet sous un sujet vide, que la console nomme", async () => {
    const result = await ingest(eml({ subject: "" }))
    const thread = await getPrisma().mailThread.findUniqueOrThrow({
      where: { id: result.threadId },
      include: { messages: true },
    })

    expect(thread.subject).toBe("")
    expect(thread.normalizedSubject).toBe("")
    expect(thread.messages[0].subject).toBeNull()
  })

  it("ne range au seau que les premières pièces jointes d'un message qui en porte trop", async () => {
    const parts = Array.from(
      { length: MAIL_MAX_INBOUND_ATTACHMENTS + 5 },
      (_, index) =>
        [
          "--mix",
          `Content-Type: text/plain; name="partie-${index}.txt"`,
          `Content-Disposition: attachment; filename="partie-${index}.txt"`,
          "",
          `partie ${index}`,
          "",
        ].join("\r\n")
    )
    const raw = new TextEncoder().encode(
      [
        "From: Camille <camille@exemple.fr>",
        "To: support@pupitre.studio",
        "Subject: Beaucoup de fichiers",
        "Message-ID: <nombreuses@exemple.fr>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/mixed; boundary="mix"',
        "",
        "--mix",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        "Voici tout.",
        "",
        ...parts,
        "--mix--",
        "",
      ].join("\r\n")
    ).buffer as ArrayBuffer

    const result = await ingest(raw)
    const message = await getPrisma().mailMessage.findUniqueOrThrow({
      where: { id: result.messageId },
      include: { attachments: true },
    })

    expect(message.attachments).toHaveLength(MAIL_MAX_INBOUND_ATTACHMENTS)
    expect(textOf(mail.objects.get(message.rawKey ?? ""))).toContain(
      `partie-${MAIL_MAX_INBOUND_ATTACHMENTS + 4}.txt`
    )
  })

  it("ne garde que les références les plus récentes d'une chaîne démesurée", async () => {
    const chain = Array.from(
      { length: 3000 },
      (_, index) => `<ancien-${index}@exemple.fr>`
    ).join(" ")

    const result = await ingest(eml({ references: chain }))
    const message = await getPrisma().mailMessage.findUniqueOrThrow({
      where: { id: result.messageId },
    })

    expect(message.references?.split(" ")).toHaveLength(MAIL_MAX_REFERENCES)
    expect(message.references).toContain("<ancien-2999@exemple.fr>")
  })

  it("range tout le message quand le seau a cassé au premier essai", async () => {
    const raw = emlWithAttachment()

    let refused = false

    configureMailStorage({
      ...mail.storage,
      put: (key, body, contentType) => {
        if (refused) {
          return mail.storage.put(key, body, contentType)
        }

        refused = true

        return Promise.reject(new Error("seau injoignable"))
      },
    })

    await expect(ingest(raw)).rejects.toThrow("seau injoignable")

    const prisma = getPrisma()

    expect(await prisma.mailMessage.count()).toBe(0)
    expect(await prisma.mailThread.count()).toBe(0)
    expect(await prisma.mailAttachment.count()).toBe(0)

    const second = await ingest(raw)
    const message = await prisma.mailMessage.findUniqueOrThrow({
      where: { id: second.messageId },
      include: { attachments: true },
    })

    expect(second.status).toBe("stored")
    expect(message.rawKey).not.toBeNull()
    expect(message.htmlKey).not.toBeNull()
    expect(textOf(mail.objects.get(message.rawKey ?? ""))).toContain("Subject:")
    expect(textOf(mail.objects.get(message.htmlKey ?? ""))).toContain("Bonjour")
    expect(message.attachments).toHaveLength(1)
    expect(message.attachments[0].key).not.toBe("")
    expect(textOf(mail.objects.get(message.attachments[0].key))).toBe(
      "erreur 502"
    )
    expect(await prisma.mailThread.count()).toBe(1)
    expect(await prisma.mailMessage.count()).toBe(1)
  })

  it("coupe un texte démesuré et garde le brut entier dans le seau", async () => {
    const body = "a".repeat(MAIL_MAX_TEXT_CHARS + 5000)
    const result = await ingest(eml({ text: body }))
    const message = await getPrisma().mailMessage.findUniqueOrThrow({
      where: { id: result.messageId },
    })

    expect(message.text).toHaveLength(MAIL_MAX_TEXT_CHARS)
    expect(textOf(mail.objects.get(message.rawKey ?? ""))).toContain(body)
  })

  it("garde l'enveloppe d'un message illisible", async () => {
    const raw = new Uint8Array([0xff, 0xfe, 0x00, 0x01]).buffer as ArrayBuffer
    const result = await ingest(raw)
    const message = await getPrisma().mailMessage.findUniqueOrThrow({
      where: { id: result.messageId },
    })

    expect(result.status).toBe("stored")
    expect(message.fromEmail).toBe("camille@exemple.fr")
    expect(message.rawKey).not.toBeNull()
  })
})

interface FakeMessage extends InboundEmailMessage {
  rejected: string | null
  bytesRead: boolean
}

function fakeMessage(rawSize: number): FakeMessage {
  const raw = eml()
  const message: FakeMessage = {
    from: "camille@exemple.fr",
    to: "support@pupitre.studio",
    rawSize,
    rejected: null,
    bytesRead: false,
    get raw() {
      message.bytesRead = true

      return new Response(raw).body as ReadableStream
    },
    setReject: (reason) => {
      message.rejected = reason
    },
  }

  return message
}

describe("handleInboundEmailMessage", () => {
  beforeAll(async () => {
    await bootApiTestServer()
  })

  afterAll(() => {
    resetFakeMail()
  })

  beforeEach(async () => {
    await resetDb()
    useFakeMail()
  })

  it("refuse un message au-dessus du plafond sans lire ses octets", async () => {
    const message = fakeMessage(MAIL_MAX_BYTES + 1)

    await handleInboundEmailMessage(message)

    expect(message.rejected).toBe(MAIL_TOO_LARGE_REASON)
    expect(message.bytesRead).toBe(false)
    expect(await getPrisma().mailMessage.count()).toBe(0)
  })

  it("range un message qui tient dans le plafond", async () => {
    const message = fakeMessage(MAIL_MAX_BYTES)

    await handleInboundEmailMessage(message)

    expect(message.rejected).toBeNull()
    expect(await getPrisma().mailMessage.count()).toBe(1)
  })
})
