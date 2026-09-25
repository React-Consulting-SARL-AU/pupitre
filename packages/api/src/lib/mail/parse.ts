import PostalMime, { type Address, type Email } from "postal-mime"
import { isAuthenticatedSender } from "./authentication"
import { stripAngles } from "./normalize"

export interface ParsedAttachment {
  filename: string
  mimeType: string
  contentId: string | null
  content: ArrayBuffer
}

export interface ParsedEmail {
  subject: string | null
  fromEmail: string | null
  fromName: string | null
  to: string[]
  cc: string[]
  text: string | null
  html: string | null
  messageId: string | null
  inReplyTo: string | null
  references: string | null
  automated: boolean
  authenticated: boolean
  attachments: ParsedAttachment[]
}

const AUTOMATED_PRECEDENCES = new Set(["bulk", "list", "junk"])

const AUTOMATED_LOCAL_PARTS = new Set(["mailer-daemon", "postmaster"])

const UNSAFE_FILENAME_RE = /[^\w.-]+/g

const PATH_SEPARATOR_RE = /[/\\]/

const EDGE_UNDERSCORES_RE = /^_+|_+$/g

const DEFAULT_ATTACHMENT_NAME = "attachment"

const DEFAULT_MIME_TYPE = "application/octet-stream"

function mailboxes(addresses: Address[] | undefined): Address[] {
  if (!addresses) {
    return []
  }

  return addresses.flatMap((address) =>
    address.group ? address.group : [address]
  )
}

function emailsOf(addresses: Address[] | undefined): string[] {
  return mailboxes(addresses)
    .map((address) => address.address?.trim().toLowerCase())
    .filter((address): address is string => Boolean(address))
}

function headerValue(email: Email, key: string): string | null {
  return email.headers.find((header) => header.key === key)?.value ?? null
}

function isAutomated(email: Email): boolean {
  if (headerValue(email, "list-unsubscribe")) {
    return true
  }

  const autoSubmitted = headerValue(email, "auto-submitted")

  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") {
    return true
  }

  const precedence = headerValue(email, "precedence")?.trim().toLowerCase()

  if (precedence && AUTOMATED_PRECEDENCES.has(precedence)) {
    return true
  }

  const sender = emailsOf(email.from ? [email.from] : undefined)[0]

  return Boolean(sender && AUTOMATED_LOCAL_PARTS.has(sender.split("@")[0]))
}

export function safeFilename(filename: string | null | undefined): string {
  const base = (filename ?? "").split(PATH_SEPARATOR_RE).pop() ?? ""
  const cleaned = base
    .replace(UNSAFE_FILENAME_RE, "_")
    .replace(EDGE_UNDERSCORES_RE, "")

  return cleaned || DEFAULT_ATTACHMENT_NAME
}

function toArrayBuffer(
  content: ArrayBuffer | Uint8Array | string
): ArrayBuffer {
  if (typeof content === "string") {
    return new TextEncoder().encode(content).buffer as ArrayBuffer
  }

  if (content instanceof Uint8Array) {
    return content.slice().buffer as ArrayBuffer
  }

  return content
}

function attachmentsOf(email: Email): ParsedAttachment[] {
  return email.attachments.map((attachment) => {
    const content = toArrayBuffer(attachment.content)

    return {
      filename: safeFilename(attachment.filename),
      mimeType: attachment.mimeType || DEFAULT_MIME_TYPE,
      contentId: attachment.contentId
        ? stripAngles(attachment.contentId)
        : null,
      content,
    }
  })
}

/** `null` when unreadable, so the delivery is still stored instead of retried forever. */
export async function parseEmail(
  raw: ArrayBuffer
): Promise<ParsedEmail | null> {
  let email: Email

  try {
    email = await PostalMime.parse(raw)
  } catch {
    return null
  }

  const from = mailboxes(email.from ? [email.from] : undefined)[0]
  const fromEmail = from?.address?.trim().toLowerCase() || null

  return {
    subject: email.subject?.trim() || null,
    fromEmail,
    fromName: from?.name?.trim() || null,
    to: emailsOf(email.to),
    cc: emailsOf(email.cc),
    text: email.text?.trim() || null,
    html: email.html || null,
    messageId: email.messageId ? stripAngles(email.messageId) : null,
    inReplyTo: email.inReplyTo ? stripAngles(email.inReplyTo) : null,
    references: email.references?.trim() || null,
    automated: isAutomated(email),
    authenticated: isAuthenticatedSender(email.headers, fromEmail),
    attachments: attachmentsOf(email),
  }
}
