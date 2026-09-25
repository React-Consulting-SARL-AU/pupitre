import {
  MAIL_MAX_BYTES,
  MAIL_MAX_INBOUND_ATTACHMENTS,
  MAIL_MAX_TEXT_CHARS,
} from "@pupitre/shared/legal"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { recordMailActivity } from "./activity"
import { mailboxIdForAddress } from "./mailboxes"
import {
  buildReferences,
  normalizeSubject,
  referencedMessageIds,
  snippetOf,
} from "./normalize"
import { type ParsedEmail, parseEmail } from "./parse"
import { publishInboxEvent } from "./realtime"
import {
  HTML_CONTENT_TYPE,
  inboundAttachmentKey,
  inboundHtmlKey,
  inboundRawKey,
  mailStorage,
  RAW_CONTENT_TYPE,
} from "./storage"
import { discardEmptyMailThread } from "./thread-mutations"
import { emailList } from "./thread-view"

export const ENVELOPE_FROM_HEADER = "x-pupitre-envelope-from"

export const ENVELOPE_TO_HEADER = "x-pupitre-envelope-to"

export const THREAD_WINDOW_DAYS = 30

export const MAIL_TOO_LARGE_REASON = "Message too large"

const MILLISECONDS_PER_DAY = 86_400_000

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

// The address is hashed too: one mail delivered to two of our addresses is two deliveries.
async function deliveryHash(
  address: string,
  raw: ArrayBuffer
): Promise<string> {
  const prefix = new TextEncoder().encode(`${address}\n`)
  const bytes = new Uint8Array(prefix.byteLength + raw.byteLength)

  bytes.set(prefix)
  bytes.set(new Uint8Array(raw), prefix.byteLength)

  const digest = await crypto.subtle.digest("SHA-256", bytes)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

// The raw `.eml` in the bucket keeps the whole body; the column holds what D1 accepts.
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
  const existing = await getPrisma().mailMessage.findFirst({
    where: messageId
      ? { OR: [{ rawHash }, { messageId, address }] }
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

// A message filed under two of our addresses resolves to the thread of the address written to.
async function threadByReferences(
  address: string,
  parsed: ParsedEmail | null
): Promise<string | null> {
  const ids = referencedMessageIds(parsed?.references, parsed?.inReplyTo)

  if (ids.length === 0) {
    return null
  }

  const referenced = await getPrisma().mailMessage.findMany({
    where: { messageId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: { threadId: true, address: true },
  })

  return (
    (referenced.find((message) => message.address === address) ?? referenced[0])
      ?.threadId ?? null
  )
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

// Objects land before any row: a failed put leaves nothing, and the replay reuses the same keys.
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
  // Parts past the cap stay in the raw `.eml`: thousands would outrun the Worker's subrequests.
  const filed = (parsed?.attachments ?? []).slice(
    0,
    MAIL_MAX_INBOUND_ATTACHMENTS
  )

  for (const [rank, attachment] of filed.entries()) {
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
  mailboxId: string | null
  subject: string
  normalizedSubject: string
  sender: string
  senderName: string | null
  authenticated: boolean
  contactUserId: string | null
  automated: boolean
}

interface ResolvedThread {
  id: string
  created: boolean
}

// An unauthenticated sender joins a thread only by referenced ids, never by a forgeable subject.
async function resolveThread(
  target: ThreadTarget,
  parsed: ParsedEmail | null,
  now: Date
): Promise<ResolvedThread> {
  const existing =
    (await threadByReferences(target.address, parsed)) ??
    (target.authenticated
      ? await threadBySubject(
          target.address,
          target.normalizedSubject,
          target.sender,
          now
        )
      : null)

  if (existing) {
    return { id: existing, created: false }
  }

  const thread = await getPrisma().mailThread.create({
    data: {
      address: target.address,
      mailboxId: target.mailboxId,
      subject: target.subject,
      normalizedSubject: target.normalizedSubject,
      contactUserId: target.contactUserId,
      senderEmail: target.sender,
      senderName: target.senderName,
      senderAuthenticated: target.authenticated,
      unread: !target.automated,
    },
    select: { id: true },
  })

  return { id: thread.id, created: true }
}

interface InboundRow {
  thread: ResolvedThread
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
        threadId: row.thread.id,
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
        address: row.address,
        inReplyTo: parsed?.inReplyTo ?? null,
        references: buildReferences(parsed?.references, null),
        automated: parsed?.automated ?? false,
        authenticated: parsed?.authenticated ?? false,
        delivery: "received",
        receivedAt: row.now,
        attachments: { create: row.stored.attachments },
      },
      select: { id: true },
    })
  } catch (error) {
    if (row.thread.created) {
      await discardEmptyMailThread(row.thread.id)
    }

    const raced = isUniqueViolation(error)
      ? await findDuplicate(row.address, row.rawHash, parsed?.messageId ?? null)
      : null

    if (!raced) {
      throw error
    }

    return raced
  }
}

/** Address plus raw bytes identify a delivery, so a Cloudflare replay lands on the row already written. */
export async function ingestInboundEmail(
  input: InboundEmail
): Promise<IngestResult> {
  const now = input.now ?? new Date()
  const address = input.envelopeTo.trim().toLowerCase()
  const rawHash = await deliveryHash(address, input.raw)
  const parsed = await parseEmail(input.raw)
  const duplicate = await findDuplicate(
    address,
    rawHash,
    parsed?.messageId ?? null
  )

  const mailboxId = await mailboxIdForAddress(address)

  if (duplicate) {
    await publishInboxEvent({
      type: "thread.received",
      thread_id: duplicate.threadId,
      mailbox_id: mailboxId,
    })

    return duplicate
  }

  const stored = await storeObjects(rawHash, input.raw, parsed)
  const sender = parsed?.fromEmail ?? input.envelopeFrom.trim().toLowerCase()
  const authenticated = parsed?.authenticated ?? false
  const subject = parsed?.subject ?? ""
  const contactUserId = authenticated
    ? await contactUserIdFor(parsed?.fromEmail ?? null)
    : null

  const thread = await resolveThread(
    {
      address,
      mailboxId,
      subject,
      normalizedSubject: normalizeSubject(subject),
      sender,
      senderName: parsed?.fromName ?? null,
      authenticated,
      contactUserId,
      automated: parsed?.automated ?? false,
    },
    parsed,
    now
  )

  const message = await writeInboundMessage(
    { thread, address, sender, rawHash, now, stored },
    parsed
  )

  if ("status" in message) {
    return message
  }

  await getPrisma().mailThread.update({
    where: { id: thread.id },
    data: {
      lastInboundAt: now,
      lastInboundAutomated: parsed?.automated ?? false,
      status: parsed?.automated ? undefined : "open",
      unread: parsed?.automated ? undefined : true,
      contactUserId: contactUserId ?? undefined,
      senderEmail: sender,
      senderName: parsed?.fromName ?? null,
      senderAuthenticated: authenticated,
      snippet: snippetOf(parsed?.text),
    },
  })

  await recordMailActivity({ threadId: thread.id, action: "received" })
  await publishInboxEvent({
    type: "thread.received",
    thread_id: thread.id,
    mailbox_id: mailboxId,
  })

  return {
    status: "stored",
    threadId: thread.id,
    messageId: message.id,
    newThread: thread.created,
  }
}

/** The subset of Email Routing's message that this path reads. */
export interface InboundEmailMessage {
  from: string
  to: string
  rawSize: number
  raw: ReadableStream
  setReject(reason: string): void
}

/** Oversized mail is refused before reading: buffering it kills the isolate, and Cloudflare replays that forever. */
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
