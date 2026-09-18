import { Prisma } from "@pupitre/db/cloudflare/client"
import { MAIL_MAX_BYTES, MAIL_MAX_TEXT_CHARS } from "@pupitre/shared/legal"
import { getPrisma } from "../api/prisma"
import { normalizeSubject, referencedMessageIds, snippetOf } from "./normalize"
import { type ParsedEmail, parseEmail } from "./parse"
import {
  HTML_CONTENT_TYPE,
  inboundAttachmentKey,
  inboundHtmlKey,
  inboundRawKey,
  mailStorage,
  RAW_CONTENT_TYPE,
} from "./storage"

export const ENVELOPE_FROM_HEADER = "x-pupitre-envelope-from"

export const ENVELOPE_TO_HEADER = "x-pupitre-envelope-to"

export const THREAD_WINDOW_DAYS = 30

export const MAIL_TOO_LARGE_REASON = "Message too large"

const MILLISECONDS_PER_DAY = 86_400_000

const UNIQUE_VIOLATION = "P2002"

const NO_SUBJECT = "(sans objet)"

const SUBJECT_CANDIDATES = 10

export interface InboundEmail {
  envelopeFrom: string
  envelopeTo: string
  raw: ArrayBuffer
  now?: Date
}

export interface IngestResult {
  status: "stored" | "duplicate"
  threadId: string
  messageId: string
  newThread: boolean
}

async function sha256(raw: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", raw)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

function emailList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

/** The raw `.eml` in the bucket holds the whole body; the column holds what D1 accepts. */
function cappedText(text: string | null | undefined): string | null {
  if (!text) {
    return null
  }

  return text.length > MAIL_MAX_TEXT_CHARS
    ? text.slice(0, MAIL_MAX_TEXT_CHARS)
    : text
}

async function findDuplicate(
  address: string,
  rawHash: string,
  messageId: string | null
): Promise<IngestResult | null> {
  const prisma = getPrisma()
  const existing = await prisma.mailMessage.findFirst({
    where: messageId
      ? { OR: [{ rawHash }, { messageId, thread: { address } }] }
      : { rawHash },
    select: { id: true, threadId: true },
  })

  if (!existing) {
    return null
  }

  return {
    status: "duplicate",
    threadId: existing.threadId,
    messageId: existing.id,
    newThread: false,
  }
}

async function threadByReferences(
  parsed: ParsedEmail | null
): Promise<string | null> {
  const ids = referencedMessageIds(parsed?.inReplyTo, parsed?.references)

  if (ids.length === 0) {
    return null
  }

  const referenced = await getPrisma().mailMessage.findFirst({
    where: { messageId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: { threadId: true },
  })

  return referenced?.threadId ?? null
}

async function threadBySubject(
  address: string,
  normalizedSubject: string,
  sender: string,
  now: Date
): Promise<string | null> {
  if (!normalizedSubject) {
    return null
  }

  const since = new Date(
    now.getTime() - THREAD_WINDOW_DAYS * MILLISECONDS_PER_DAY
  )
  const candidates = await getPrisma().mailThread.findMany({
    where: { address, normalizedSubject, updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: SUBJECT_CANDIDATES,
    select: {
      id: true,
      messages: { select: { fromEmail: true, toEmails: true } },
    },
  })
  const shares = candidates.find((thread) =>
    thread.messages.some(
      (message) =>
        message.fromEmail === sender ||
        emailList(message.toEmails).includes(sender)
    )
  )

  return shares?.id ?? null
}

interface StoredAttachment {
  key: string
  filename: string
  mimeType: string
  size: number
  contentId: string | null
}

interface StoredObjects {
  rawKey: string
  htmlKey: string | null
  attachments: StoredAttachment[]
}

/**
 * Everything reaches the bucket before a single row is written: a put that
 * fails leaves nothing behind, and the replay that follows lands on the same
 * keys rather than on a row whose body was lost.
 */
async function storeObjects(
  rawHash: string,
  raw: ArrayBuffer,
  parsed: ParsedEmail | null
): Promise<StoredObjects> {
  const storage = await mailStorage()
  const rawKey = inboundRawKey(rawHash)

  await storage.put(rawKey, raw, RAW_CONTENT_TYPE)

  let htmlKey: string | null = null

  if (parsed?.html) {
    htmlKey = inboundHtmlKey(rawHash)

    await storage.put(
      htmlKey,
      new TextEncoder().encode(parsed.html).buffer as ArrayBuffer,
      HTML_CONTENT_TYPE
    )
  }

  const attachments: StoredAttachment[] = []

  for (const [rank, attachment] of (parsed?.attachments ?? []).entries()) {
    const key = inboundAttachmentKey(rawHash, rank, attachment.filename)

    await storage.put(key, attachment.content, attachment.mimeType)
    attachments.push({
      key,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.content.byteLength,
      contentId: attachment.contentId,
    })
  }

  return { rawKey, htmlKey, attachments }
}

async function contactUserIdFor(email: string | null): Promise<string | null> {
  if (!email) {
    return null
  }

  const user = await getPrisma().user.findFirst({
    where: { email },
    select: { id: true },
  })

  return user?.id ?? null
}

interface ThreadTarget {
  address: string
  subject: string
  normalizedSubject: string
  sender: string
  contactUserId: string | null
  automated: boolean
}

async function resolveThread(
  target: ThreadTarget,
  parsed: ParsedEmail | null,
  now: Date
): Promise<{ id: string; created: boolean }> {
  const existing =
    (await threadByReferences(parsed)) ??
    (await threadBySubject(
      target.address,
      target.normalizedSubject,
      target.sender,
      now
    ))

  if (existing) {
    return { id: existing, created: false }
  }

  const thread = await getPrisma().mailThread.create({
    data: {
      address: target.address,
      subject: target.subject,
      normalizedSubject: target.normalizedSubject,
      contactUserId: target.contactUserId,
      unread: !target.automated,
    },
    select: { id: true },
  })

  return { id: thread.id, created: true }
}

interface InboundRow {
  threadId: string
  address: string
  sender: string
  rawHash: string
  now: Date
  stored: StoredObjects
}

async function writeInboundMessage(
  row: InboundRow,
  parsed: ParsedEmail | null
): Promise<{ id: string } | IngestResult> {
  try {
    return await getPrisma().mailMessage.create({
      data: {
        threadId: row.threadId,
        direction: "inbound",
        fromEmail: row.sender,
        fromName: parsed?.fromName ?? null,
        toEmails: parsed?.to.length ? parsed.to : [row.address],
        ccEmails: parsed?.cc ?? [],
        subject: parsed?.subject ?? null,
        text: cappedText(parsed?.text),
        snippet: snippetOf(parsed?.text),
        rawKey: row.stored.rawKey,
        htmlKey: row.stored.htmlKey,
        rawHash: row.rawHash,
        messageId: parsed?.messageId ?? null,
        inReplyTo: parsed?.inReplyTo ?? null,
        references: parsed?.references ?? null,
        automated: parsed?.automated ?? false,
        delivery: "received",
        receivedAt: row.now,
        attachments: { create: row.stored.attachments },
      },
      select: { id: true },
    })
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      )
    ) {
      throw error
    }

    const raced = await findDuplicate(
      row.address,
      row.rawHash,
      parsed?.messageId ?? null
    )

    if (!raced) {
      throw error
    }

    return raced
  }
}

/**
 * The raw bytes are the identity of a message: Cloudflare replays a delivery
 * that failed, and a replay must land on the row already written rather than a
 * second copy of the same mail.
 */
export async function ingestInboundEmail(
  input: InboundEmail
): Promise<IngestResult> {
  const prisma = getPrisma()
  const now = input.now ?? new Date()
  const address = input.envelopeTo.trim().toLowerCase()
  const rawHash = await sha256(input.raw)
  const parsed = await parseEmail(input.raw)
  const duplicate = await findDuplicate(
    address,
    rawHash,
    parsed?.messageId ?? null
  )

  if (duplicate) {
    return duplicate
  }

  const stored = await storeObjects(rawHash, input.raw, parsed)
  const sender = parsed?.fromEmail ?? input.envelopeFrom.trim().toLowerCase()
  const subject = parsed?.subject ?? NO_SUBJECT
  const contactUserId = await contactUserIdFor(parsed?.fromEmail ?? null)
  const thread = await resolveThread(
    {
      address,
      subject,
      normalizedSubject: normalizeSubject(subject),
      sender,
      contactUserId,
      automated: parsed?.automated ?? false,
    },
    parsed,
    now
  )
  const message = await writeInboundMessage(
    { threadId: thread.id, address, sender, rawHash, now, stored },
    parsed
  )

  if ("status" in message) {
    return message
  }

  await prisma.mailThread.update({
    where: { id: thread.id },
    data: {
      lastInboundAt: now,
      status: parsed?.automated ? undefined : "open",
      unread: parsed?.automated ? undefined : true,
      contactUserId: contactUserId ?? undefined,
    },
  })

  return {
    status: "stored",
    threadId: thread.id,
    messageId: message.id,
    newThread: thread.created,
  }
}

/** What Email Routing hands the Worker, and all this path reads of it. */
export interface InboundEmailMessage {
  from: string
  to: string
  rawSize: number
  raw: ReadableStream
  setReject(reason: string): void
}

/**
 * The envelope announces the size before the bytes are read: a mail over the
 * cap is refused at the door, because buffering it kills the isolate and
 * Cloudflare replays a delivery that died, forever.
 */
export async function handleInboundEmailMessage(
  message: InboundEmailMessage
): Promise<void> {
  if (message.rawSize > MAIL_MAX_BYTES) {
    message.setReject(MAIL_TOO_LARGE_REASON)

    return
  }

  await ingestInboundEmail({
    envelopeFrom: message.from,
    envelopeTo: message.to,
    raw: await new Response(message.raw).arrayBuffer(),
  })
}
