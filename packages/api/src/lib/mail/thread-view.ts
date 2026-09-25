import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

export interface MailPerson {
  id: string
  name: string
  email: string
}

export interface MailContact {
  user_id: string
  email: string
  name: string
}

export interface MailSender {
  email: string
  name: string | null
}

export interface MailLinkedOrganization {
  id: string
  name: string
  slug: string
}

export interface MailMailboxRef {
  id: string
  address: string
  display_name: string
  signature: string | null
  sensitive: boolean
  can_reply: boolean
  enabled: boolean
}

export interface MailThreadView {
  id: string
  address: string
  mailbox_id: string | null
  subject: string
  status: string
  unread: boolean
  assigned_user: MailPerson | null
  contact: MailContact | null
  linked_organization: MailLinkedOrganization | null
  from: MailSender
  sender_authenticated: boolean
  snippet: string | null
  messages: number
  notes: number
  has_draft: boolean
  automated: boolean
  last_inbound_at: Date | null
  last_outbound_at: Date | null
  updated_at: Date
  created_at: Date
}

export interface MailAttachmentView {
  id: string
  filename: string
  mime_type: string
  size: number
}

export interface MailMessageView {
  id: string
  direction: string
  from: MailSender
  to: string[]
  cc: string[]
  subject: string | null
  text: string | null
  has_html: boolean
  automated: boolean
  authenticated: boolean
  delivery: string
  error: string | null
  sent_by: { id: string; name: string } | null
  received_at: Date
  sent_at: Date | null
  attachments: MailAttachmentView[]
}

export const THREAD_INCLUDE = {
  mailbox: true,
  linkedOrganization: { select: { id: true, name: true, slug: true } },
  draft: { select: { threadId: true } },
  _count: { select: { notes: true, messages: true } },
} as const

export type ThreadRow = Prisma.MailThreadGetPayload<{
  include: typeof THREAD_INCLUDE
}>

export const MESSAGE_VIEW_SELECT = {
  id: true,
  direction: true,
  fromEmail: true,
  fromName: true,
  toEmails: true,
  ccEmails: true,
  subject: true,
  text: true,
  htmlKey: true,
  automated: true,
  authenticated: true,
  delivery: true,
  error: true,
  sentByUserId: true,
  receivedAt: true,
  sentAt: true,
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, mimeType: true, size: true },
  },
} as const

type MessageRow = Prisma.MailMessageGetPayload<{
  select: typeof MESSAGE_VIEW_SELECT
}>

export function emailList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

export async function peopleNamed(
  userIds: (string | null)[]
): Promise<Map<string, MailPerson>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]

  if (ids.length === 0) {
    return new Map()
  }

  const users = await getPrisma().user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  })

  return new Map(users.map((user) => [user.id, user]))
}

export function mailboxRefOf(
  mailbox: ThreadRow["mailbox"]
): MailMailboxRef | null {
  if (!mailbox) {
    return null
  }

  return {
    id: mailbox.id,
    address: mailbox.address,
    display_name: mailbox.displayName,
    signature: mailbox.signature,
    sensitive: mailbox.sensitive,
    can_reply: mailbox.canReply,
    enabled: mailbox.enabled,
  }
}

export function threadViewOf(
  thread: ThreadRow,
  people: Map<string, MailPerson>
): MailThreadView {
  const assigned = thread.assignedUserId
    ? (people.get(thread.assignedUserId) ?? null)
    : null
  const contact = thread.contactUserId
    ? (people.get(thread.contactUserId) ?? null)
    : null

  return {
    id: thread.id,
    address: thread.address,
    mailbox_id: thread.mailboxId,
    subject: thread.subject,
    status: thread.status,
    unread: thread.unread,
    assigned_user: assigned,
    contact: contact
      ? { user_id: contact.id, email: contact.email, name: contact.name }
      : null,
    linked_organization: thread.linkedOrganization,
    from: { email: thread.senderEmail ?? "", name: thread.senderName },
    sender_authenticated: thread.senderAuthenticated,
    snippet: thread.snippet,
    messages: thread._count.messages,
    notes: thread._count.notes,
    has_draft: thread.draft !== null,
    automated: thread.lastInboundAutomated,
    last_inbound_at: thread.lastInboundAt,
    last_outbound_at: thread.lastOutboundAt,
    updated_at: thread.updatedAt,
    created_at: thread.createdAt,
  }
}

export function messageViewOf(
  message: MessageRow,
  people: Map<string, MailPerson>
): MailMessageView {
  const sentBy = message.sentByUserId
    ? (people.get(message.sentByUserId) ?? null)
    : null

  return {
    id: message.id,
    direction: message.direction,
    from: { email: message.fromEmail, name: message.fromName },
    to: emailList(message.toEmails),
    cc: emailList(message.ccEmails),
    subject: message.subject,
    text: message.text,
    has_html: Boolean(message.htmlKey),
    automated: message.automated,
    authenticated: message.authenticated,
    delivery: message.delivery,
    error: message.error,
    sent_by: sentBy ? { id: sentBy.id, name: sentBy.name } : null,
    received_at: message.receivedAt,
    sent_at: message.sentAt,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mime_type: attachment.mimeType,
      size: attachment.size,
    })),
  }
}
