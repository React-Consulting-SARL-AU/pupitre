import {
  isMailSenderAddress,
  LEGAL_CONTACTS,
  MAIL_DOMAIN,
  type MailSenderAddress,
} from "@pupitre/shared/legal"
import { buildMimeMessage, generateMessageId } from "../../emails/mime"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import {
  buildReferences,
  normalizeSubject,
  replySubject,
  snippetOf,
  stripAngles,
} from "./normalize"
import { safeFilename } from "./parse"
import {
  mailStorage,
  outboundAttachmentKey,
  RAW_CONTENT_TYPE,
  rawKeyFor,
} from "./storage"
import {
  emailList,
  type MailMessageView,
  type MailThreadDetail,
  readMailThread,
} from "./threads"
import { mailTransport } from "./transport"
import {
  assertMailAttachments,
  deleteMailUploads,
  type MailAttachmentInput,
  type MailUploadBytes,
  readMailUploads,
} from "./uploads"

const OWN_DOMAIN_SUFFIX = `@${MAIL_DOMAIN}`

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
}

const ESCAPE_RE = /[&<>]/g

const NEWLINE_RE = /\r?\n/g

export class MailSendFailedError extends Error {
  readonly reason: string
  readonly messageId: string

  constructor(reason: string, messageId: string) {
    super(reason)
    this.name = "MailSendFailedError"
    this.reason = reason
    this.messageId = messageId
  }
}

export class MailThreadHasNoRecipientError extends Error {
  constructor() {
    super("this thread carries no address to answer")
    this.name = "MailThreadHasNoRecipientError"
  }
}

function textToHtml(text: string): string {
  return `<div>${text
    .replace(ESCAPE_RE, (character) => ESCAPES[character])
    .replace(NEWLINE_RE, "<br>")}</div>`
}

function isOurs(address: string): boolean {
  return address.endsWith(OWN_DOMAIN_SUFFIX)
}

function senderFor(address: string): MailSenderAddress {
  return isMailSenderAddress(address) ? address : LEGAL_CONTACTS.support
}

interface Delivery {
  threadId: string
  from: string
  to: string[]
  cc: string[]
  subject: string
  text: string
  inReplyTo: string | null
  references: string | null
  sentByUserId: string
  uploads: MailUploadBytes[]
}

interface FiledAttachment {
  key: string
  filename: string
  mimeType: string
  size: number
}

/** Each upload is copied under the message before anything leaves: the row it will hang from never lacks its bytes. */
async function fileAttachments(
  threadId: string,
  messageId: string,
  uploads: MailUploadBytes[]
): Promise<FiledAttachment[]> {
  const storage = await mailStorage()
  const filed: FiledAttachment[] = []

  for (const [rank, upload] of uploads.entries()) {
    const key = outboundAttachmentKey(
      threadId,
      messageId,
      rank,
      upload.filename
    )

    await storage.put(key, upload.body, upload.mimeType)
    filed.push({
      key,
      filename: safeFilename(upload.filename),
      mimeType: upload.mimeType,
      size: upload.body.byteLength,
    })
  }

  return filed
}

async function deliver(delivery: Delivery): Promise<string> {
  const prisma = getPrisma()
  const now = new Date()
  const messageId = generateMessageId(MAIL_DOMAIN)
  const { uploads } = delivery
  const raw = buildMimeMessage({
    from: delivery.from,
    to: delivery.to,
    cc: delivery.cc,
    subject: delivery.subject,
    text: delivery.text,
    html: textToHtml(delivery.text),
    messageId,
    inReplyTo: delivery.inReplyTo ? `<${delivery.inReplyTo}>` : null,
    references: delivery.references,
    date: now,
    attachments: uploads.map((upload) => ({
      filename: safeFilename(upload.filename),
      contentType: upload.mimeType,
      content: upload.body,
    })),
  })

  const bareId = stripAngles(messageId)
  const rawKey = rawKeyFor(delivery.threadId, bareId)
  const storage = await mailStorage()

  await storage.put(
    rawKey,
    new TextEncoder().encode(raw).buffer as ArrayBuffer,
    RAW_CONTENT_TYPE
  )

  const filed = await fileAttachments(delivery.threadId, bareId, uploads)

  let failure: string | null = null

  try {
    await mailTransport()({
      from: delivery.from,
      to: delivery.to,
      cc: delivery.cc,
      raw,
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  const message = await prisma.mailMessage.create({
    data: {
      threadId: delivery.threadId,
      direction: "outbound",
      fromEmail: delivery.from,
      toEmails: delivery.to,
      ccEmails: delivery.cc,
      subject: delivery.subject,
      text: delivery.text,
      snippet: snippetOf(delivery.text),
      messageId: bareId,
      inReplyTo: delivery.inReplyTo,
      references: delivery.references,
      sentByUserId: delivery.sentByUserId,
      delivery: failure ? "failed" : "sent",
      error: failure,
      rawKey,
      receivedAt: now,
      sentAt: failure ? null : now,
      attachments: { create: filed },
    },
    select: { id: true },
  })

  await deleteMailUploads(uploads.map((upload) => upload.key))

  if (failure) {
    throw new MailSendFailedError(failure, message.id)
  }

  await prisma.mailThread.update({
    where: { id: delivery.threadId },
    data: { lastOutboundAt: now, unread: false },
  })

  return message.id
}

interface AnsweredMessage {
  direction: string
  automated: boolean
  fromEmail: string
  toEmails: unknown
  ccEmails: unknown
  messageId: string | null
  references: string | null
}

/**
 * A bounce or a list blast is never answered: the reply goes to the last
 * person who wrote, and failing that back to whoever we wrote to ourselves.
 */
function messageToAnswer<T extends AnsweredMessage>(
  messages: T[]
): T | undefined {
  const human = messages.filter(
    (message) => message.direction === "inbound" && !message.automated
  )

  return (
    human.at(-1) ??
    messages.filter((message) => message.direction === "outbound").at(-1)
  )
}

/**
 * An address of ours is never a recipient — the inbox does not write to
 * itself, and a sender claiming `support@pupitre.studio` does not turn a reply
 * into a loop.
 */
function recipientsOf(answered: AnsweredMessage): {
  to: string[]
  cc: string[]
} {
  const to = (
    answered.direction === "inbound"
      ? [answered.fromEmail]
      : emailList(answered.toEmails)
  ).filter((address) => !isOurs(address))
  const cc = [
    ...new Set([
      ...emailList(answered.ccEmails),
      ...emailList(answered.toEmails),
    ]),
  ].filter((address) => !(isOurs(address) || to.includes(address)))

  return { to, cc }
}

async function messageOf(
  threadId: string,
  messageId: string
): Promise<MailMessageView | null> {
  const thread = await readMailThread(threadId)

  return thread?.messages.find((message) => message.id === messageId) ?? null
}

export interface ReplyInput {
  text: string
  attachments?: MailAttachmentInput[]
}

export async function replyToMailThread(
  actor: Actor & { userId: string },
  threadId: string,
  input: ReplyInput
): Promise<MailMessageView | null> {
  const attachments = input.attachments ?? []

  assertMailAttachments(actor.userId, attachments)

  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({ where: { id: threadId } })

  if (!thread) {
    return null
  }

  const messages = await prisma.mailMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  })
  const answered = messageToAnswer(messages)

  if (!answered) {
    throw new MailThreadHasNoRecipientError()
  }

  const { to, cc } = recipientsOf(answered)

  if (to.length === 0) {
    throw new MailThreadHasNoRecipientError()
  }

  const messageId = await deliver({
    threadId,
    from: senderFor(thread.address),
    to,
    cc,
    subject: replySubject(thread.subject),
    text: input.text,
    inReplyTo: answered.messageId,
    references: buildReferences(answered.references, answered.messageId),
    sentByUserId: actor.userId,
    uploads: await readMailUploads(attachments),
  })

  await recordEvent({
    action: "mail.replied",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: threadId,
  })

  return await messageOf(threadId, messageId)
}

export interface ComposeInput {
  from: MailSenderAddress
  to: string[]
  subject: string
  text: string
  attachments?: MailAttachmentInput[]
}

export async function composeMailThread(
  actor: Actor & { userId: string },
  input: ComposeInput
): Promise<MailThreadDetail | null> {
  const attachments = input.attachments ?? []

  assertMailAttachments(actor.userId, attachments)

  const uploads = await readMailUploads(attachments)
  const prisma = getPrisma()
  const recipients = input.to.map((address) => address.trim().toLowerCase())
  const contact = await prisma.user.findFirst({
    where: { email: { in: recipients } },
    select: { id: true },
  })
  const thread = await prisma.mailThread.create({
    data: {
      address: input.from,
      subject: input.subject,
      normalizedSubject: normalizeSubject(input.subject),
      unread: false,
      contactUserId: contact?.id ?? null,
    },
    select: { id: true },
  })

  await deliver({
    threadId: thread.id,
    from: input.from,
    to: recipients,
    cc: [],
    subject: input.subject,
    text: input.text,
    inReplyTo: null,
    references: null,
    sentByUserId: actor.userId,
    uploads,
  })
  await recordEvent({
    action: "mail.composed",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: thread.id,
  })

  return await readMailThread(thread.id)
}
