import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { LEGAL_CONTACTS } from "@pupitre/shared/legal"
import { PLATFORM_MAILBOX_IDS } from "@pupitre/shared/platform"
import { bootApiTestServer, resetDb } from "../../testing"
import {
  resetFakeMail,
  seedPlatformMailboxes,
  useFakeMail,
} from "../../testing/mail"
import { createUser } from "../../testing/session"
import { getPrisma } from "../api/prisma"
import {
  MailboxCannotReplyError,
  MailThreadHasNoMailboxError,
  MailThreadHasNoRecipientError,
  replyToMailThread,
} from "./outbound"
import { type MailAttachmentInput, MailAttachmentRefusedError } from "./uploads"

const MESSAGE_ID_RE = /Message-ID: <([^>]+)>/

const FROM_HEADER_RE = /From: (.+)/

interface MessageInput {
  direction?: "inbound" | "outbound"
  fromEmail?: string
  toEmails?: string[]
  ccEmails?: string[]
  automated?: boolean
  messageId?: string
}

async function thread(mailboxId: string | null = PLATFORM_MAILBOX_IDS.support) {
  const row = await getPrisma().mailThread.create({
    data: {
      address: LEGAL_CONTACTS.support,
      mailboxId,
      subject: "Mon serveur ne repond plus",
      normalizedSubject: "mon serveur ne repond plus",
    },
    select: { id: true },
  })

  return row.id
}

async function message(threadId: string, input: MessageInput): Promise<void> {
  await getPrisma().mailMessage.create({
    data: {
      threadId,
      direction: input.direction ?? "inbound",
      fromEmail: input.fromEmail ?? "camille@exemple.fr",
      toEmails: input.toEmails ?? [LEGAL_CONTACTS.support],
      ccEmails: input.ccEmails ?? [],
      automated: input.automated ?? false,
      messageId: input.messageId ?? crypto.randomUUID(),
      subject: "Mon serveur ne repond plus",
      delivery: input.direction === "outbound" ? "sent" : "received",
    },
  })
}

describe("replyToMailThread", () => {
  let mail: ReturnType<typeof useFakeMail>
  let actor: { userId: string }

  beforeAll(async () => {
    await bootApiTestServer()
  })

  afterAll(() => {
    resetFakeMail()
  })

  beforeEach(async () => {
    await resetDb()
    mail = useFakeMail()
    await seedPlatformMailboxes()

    const { user } = await createUser({
      email: "jordan@pupitre.studio",
      name: "Jordan Monier",
    })

    actor = { userId: user.id }
  })

  function reply(threadId: string, attachments?: MailAttachmentInput[]) {
    return replyToMailThread(
      { userId: actor.userId, source: "console" },
      threadId,
      { text: "Bonjour, on regarde.", attachments }
    )
  }

  it("replies to the last human message and skips the automatic one", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })
    await message(threadId, {
      direction: "outbound",
      fromEmail: LEGAL_CONTACTS.support,
      toEmails: ["camille@exemple.fr"],
    })
    await message(threadId, {
      automated: true,
      fromEmail: "mailer-daemon@exemple.fr",
    })

    const sent = await reply(threadId)

    expect(sent?.to).toEqual(["camille@exemple.fr"])
    expect(mail.sent[0].to).toEqual(["camille@exemple.fr"])
  })

  it("carries the sent reply as the thread's last snippet, filed under the mailbox", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })

    const sent = await reply(threadId)
    const prisma = getPrisma()
    const row = await prisma.mailThread.findUniqueOrThrow({
      where: { id: threadId },
    })
    const stored = await prisma.mailMessage.findUniqueOrThrow({
      where: { id: sent?.id ?? "" },
    })

    expect(sent?.authenticated).toBe(true)
    expect(row.snippet).toBe("Bonjour, on regarde.")
    expect(stored.address).toBe(LEGAL_CONTACTS.support)
  })

  it("refuses when the only incoming message impersonates one of our addresses", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: LEGAL_CONTACTS.support })

    await expect(reply(threadId)).rejects.toBeInstanceOf(
      MailThreadHasNoRecipientError
    )
    expect(mail.sent).toHaveLength(0)
  })

  it("refuses when the thread only carries an automatic message", async () => {
    const threadId = await thread()

    await message(threadId, {
      automated: true,
      fromEmail: "postmaster@exemple.fr",
    })

    await expect(reply(threadId)).rejects.toBeInstanceOf(
      MailThreadHasNoRecipientError
    )
  })

  it("reuses the copies of the replied-to message, minus our own", async () => {
    const threadId = await thread()

    await message(threadId, {
      fromEmail: "camille@exemple.fr",
      toEmails: [LEGAL_CONTACTS.support, "equipe@exemple.fr"],
      ccEmails: ["direction@exemple.fr", LEGAL_CONTACTS.legal],
    })

    const sent = await reply(threadId)

    expect(sent?.to).toEqual(["camille@exemple.fr"])
    expect(sent?.cc).toEqual(["direction@exemple.fr", "equipe@exemple.fr"])
  })

  it("files each upload under the message, records it, and erases the upload", async () => {
    const threadId = await thread()
    const uploadKey = `mail/uploads/${actor.userId}/uuid/rapport.pdf`

    await message(threadId, { fromEmail: "camille@exemple.fr" })
    mail.objects.set(uploadKey, {
      body: new TextEncoder().encode("%PDF").buffer as ArrayBuffer,
      contentType: "application/pdf",
    })

    const sent = await reply(threadId, [
      {
        key: uploadKey,
        filename: "rapport.pdf",
        mime_type: "application/pdf",
        size: 4,
      },
    ])
    const filedKey = `mail/${threadId}/${mail.sent[0].raw.match(MESSAGE_ID_RE)?.[1]}/attachments/0/rapport.pdf`

    expect(sent?.attachments).toEqual([
      {
        id: expect.any(String),
        filename: "rapport.pdf",
        mime_type: "application/pdf",
        size: 4,
      },
    ])
    expect(mail.objects.has(filedKey)).toBe(true)
    expect(mail.objects.has(uploadKey)).toBe(false)
    expect(mail.sent[0].raw).toContain("multipart/mixed")
    expect(mail.sent[0].raw).toContain('filename="rapport.pdf"')
  })

  it("refuses a missing upload without sending or writing anything", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })

    await expect(
      reply(threadId, [
        {
          key: `mail/uploads/${actor.userId}/uuid/rapport.pdf`,
          filename: "rapport.pdf",
          mime_type: "application/pdf",
          size: 4,
        },
      ])
    ).rejects.toBeInstanceOf(MailAttachmentRefusedError)
    expect(mail.sent).toHaveLength(0)
    expect(
      await getPrisma().mailMessage.count({
        where: { threadId, direction: "outbound" },
      })
    ).toBe(0)
  })

  it("signs the reply with the first name of whoever replies, and the thread's mailbox", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })
    await getPrisma().mailMailbox.update({
      where: { id: PLATFORM_MAILBOX_IDS.support },
      data: { signature: "Jordan\nPupitre" },
    })

    const sent = await reply(threadId)

    expect(sent?.from.email).toBe(LEGAL_CONTACTS.support)
    expect(sent?.text).toContain("Bonjour, on regarde.")
    expect(sent?.text).toContain("Jordan\nPupitre")
    expect(mail.sent[0].from).toBe(LEGAL_CONTACTS.support)
    expect(mail.sent[0].raw.match(FROM_HEADER_RE)?.[1]).toContain(
      `<${LEGAL_CONTACTS.support}>`
    )
  })

  it("takes the requested recipients rather than those of the replied-to message", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })

    const sent = await replyToMailThread(
      { userId: actor.userId, source: "console" },
      threadId,
      {
        text: "Bonjour, on regarde.",
        to: ["Autre@Exemple.fr"],
        cc: ["copie@exemple.fr"],
      }
    )

    expect(sent?.to).toEqual(["autre@exemple.fr"])
    expect(sent?.cc).toEqual(["copie@exemple.fr"])
  })

  it("erases the thread's draft once the reply is sent", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })
    await getPrisma().mailDraft.create({
      data: { threadId, body: "en cours", updatedByUserId: actor.userId },
    })

    await reply(threadId)

    expect(await getPrisma().mailDraft.count({ where: { threadId } })).toBe(0)
  })

  it("refuses to reply from a thread that no mailbox declares", async () => {
    const threadId = await thread(null)

    await message(threadId, { fromEmail: "camille@exemple.fr" })

    await expect(reply(threadId)).rejects.toBeInstanceOf(
      MailThreadHasNoMailboxError
    )
    expect(mail.sent).toHaveLength(0)
  })

  it("refuses to reply from a deactivated mailbox", async () => {
    const threadId = await thread()

    await message(threadId, { fromEmail: "camille@exemple.fr" })
    await getPrisma().mailMailbox.update({
      where: { id: PLATFORM_MAILBOX_IDS.support },
      data: { enabled: false },
    })

    await expect(reply(threadId)).rejects.toBeInstanceOf(
      MailboxCannotReplyError
    )
    expect(mail.sent).toHaveLength(0)
  })

  it("writes to the recipient of our last message when nobody has replied", async () => {
    const threadId = await thread()

    await message(threadId, {
      direction: "outbound",
      fromEmail: LEGAL_CONTACTS.support,
      toEmails: ["client@exemple.fr", LEGAL_CONTACTS.legal],
    })

    const sent = await reply(threadId)

    expect(sent?.to).toEqual(["client@exemple.fr"])
  })
})
