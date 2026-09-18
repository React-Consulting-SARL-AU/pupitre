import type { Prisma } from "@pupitre/db/cloudflare/client"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"

export const MAIL_PAGE_SIZE = 50

export const MAIL_MAX_PAGE_SIZE = 200

export type MailThreadStatus = "open" | "closed"

/** `me`, `none`, or the identifier of the person the thread is assigned to. */
export type MailAssignedFilter = string

export interface MailThreadFilter {
  viewerId: string
  status?: MailThreadStatus
  unread?: boolean
  q?: string
  address?: string
  assigned?: MailAssignedFilter
  limit: number
  offset: number
}

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

export interface MailThreadView {
  id: string
  address: string
  subject: string
  status: string
  unread: boolean
  assigned_user: MailPerson | null
  contact: MailContact | null
  from: MailSender
  snippet: string | null
  messages: number
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
  delivery: string
  error: string | null
  sent_by: { id: string; name: string } | null
  received_at: Date
  sent_at: Date | null
  attachments: MailAttachmentView[]
}

export interface MailThreadPage {
  data: MailThreadView[]
  total: number
  unread: number
}

export interface MailThreadPatch {
  status?: MailThreadStatus
  unread?: boolean
  assigned_user_id?: string | null
}

export class MailAssigneeNotOnTheTeamError extends Error {
  readonly userId: string

  constructor(userId: string) {
    super(`${userId} is not a member of the platform organization`)
    this.name = "MailAssigneeNotOnTheTeamError"
    this.userId = userId
  }
}

const MESSAGE_SUMMARY_SELECT = {
  id: true,
  threadId: true,
  direction: true,
  fromEmail: true,
  fromName: true,
  toEmails: true,
  snippet: true,
  createdAt: true,
} as const

type MessageSummary = Prisma.MailMessageGetPayload<{
  select: typeof MESSAGE_SUMMARY_SELECT
}>

export function emailList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function assignedWhere(
  assigned: MailAssignedFilter | undefined,
  viewerId: string
): Prisma.MailThreadWhereInput {
  if (!assigned) {
    return {}
  }

  if (assigned === "none") {
    return { assignedUserId: null }
  }

  return { assignedUserId: assigned === "me" ? viewerId : assigned }
}

function whereOf(
  filter: MailThreadFilter,
  withUnread: boolean
): Prisma.MailThreadWhereInput {
  const q = filter.q?.trim()

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(withUnread && filter.unread !== undefined
      ? { unread: filter.unread }
      : {}),
    ...(filter.address ? { address: filter.address.toLowerCase() } : {}),
    ...assignedWhere(filter.assigned, filter.viewerId),
    ...(q
      ? {
          OR: [
            { subject: { contains: q } },
            {
              messages: {
                some: {
                  OR: [
                    { fromEmail: { contains: q } },
                    { fromName: { contains: q } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  }
}

async function peopleNamed(
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

/** The address the list shows: whoever wrote in last, or whoever we wrote to. */
function senderOf(messages: MessageSummary[]): MailSender {
  const inbound = messages.filter((message) => message.direction === "inbound")
  const last = inbound.at(-1) ?? messages.at(-1)

  if (!last) {
    return { email: "", name: null }
  }

  if (last.direction === "inbound") {
    return { email: last.fromEmail, name: last.fromName }
  }

  return { email: emailList(last.toEmails)[0] ?? last.fromEmail, name: null }
}

function viewOf(
  thread: Prisma.MailThreadGetPayload<Record<string, never>>,
  messages: MessageSummary[],
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
    subject: thread.subject,
    status: thread.status,
    unread: thread.unread,
    assigned_user: assigned,
    contact: contact
      ? { user_id: contact.id, email: contact.email, name: contact.name }
      : null,
    from: senderOf(messages),
    snippet: messages.at(-1)?.snippet ?? null,
    messages: messages.length,
    last_inbound_at: thread.lastInboundAt,
    last_outbound_at: thread.lastOutboundAt,
    updated_at: thread.updatedAt,
    created_at: thread.createdAt,
  }
}

function groupByThread(
  messages: MessageSummary[]
): Map<string, MessageSummary[]> {
  const byThread = new Map<string, MessageSummary[]>()

  for (const message of messages) {
    const rows = byThread.get(message.threadId) ?? []

    rows.push(message)
    byThread.set(message.threadId, rows)
  }

  return byThread
}

export async function listMailThreads(
  filter: MailThreadFilter
): Promise<MailThreadPage> {
  const prisma = getPrisma()
  const where = whereOf(filter, true)
  const [threads, total, unread] = await Promise.all([
    prisma.mailThread.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: filter.limit,
      skip: filter.offset,
    }),
    prisma.mailThread.count({ where }),
    prisma.mailThread.count({
      where: { ...whereOf(filter, false), unread: true },
    }),
  ])
  const messages = await prisma.mailMessage.findMany({
    where: { threadId: { in: threads.map((thread) => thread.id) } },
    orderBy: { createdAt: "asc" },
    select: MESSAGE_SUMMARY_SELECT,
  })
  const byThread = groupByThread(messages)
  const people = await peopleNamed(
    threads.flatMap((thread) => [thread.assignedUserId, thread.contactUserId])
  )

  return {
    data: threads.map((thread) =>
      viewOf(thread, byThread.get(thread.id) ?? [], people)
    ),
    total,
    unread,
  }
}

/** The thread opened: `messages` carries them here, where the list only counts them. */
export type MailThreadDetail = Omit<MailThreadView, "messages"> & {
  messages: MailMessageView[]
}

export async function readMailThread(
  threadId: string
): Promise<MailThreadDetail | null> {
  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({ where: { id: threadId } })

  if (!thread) {
    return null
  }

  const messages = await prisma.mailMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: { attachments: { orderBy: { createdAt: "asc" } } },
  })
  const people = await peopleNamed([
    thread.assignedUserId,
    thread.contactUserId,
    ...messages.map((message) => message.sentByUserId),
  ])
  const summaries: MessageSummary[] = messages.map((message) => ({
    id: message.id,
    threadId: message.threadId,
    direction: message.direction,
    fromEmail: message.fromEmail,
    fromName: message.fromName,
    toEmails: message.toEmails,
    snippet: message.snippet,
    createdAt: message.createdAt,
  }))

  return {
    ...viewOf(thread, summaries, people),
    messages: messages.map((message) => {
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
    }),
  }
}

async function assertOnTheTeam(userId: string): Promise<void> {
  const member = await getPrisma().member.findFirst({
    where: { userId, organizationId: PLATFORM_ORGANIZATION_ID },
    select: { id: true },
  })

  if (!member) {
    throw new MailAssigneeNotOnTheTeamError(userId)
  }
}

async function recordThreadChanges(
  actor: Actor,
  threadId: string,
  before: { status: string; assignedUserId: string | null },
  patch: MailThreadPatch
): Promise<void> {
  if (patch.status && patch.status !== before.status) {
    await recordEvent({
      action: patch.status === "closed" ? "mail.closed" : "mail.reopened",
      actorUserId: actor.userId,
      targetType: "mail_thread",
      targetId: threadId,
    })
  }

  if (
    patch.assigned_user_id !== undefined &&
    patch.assigned_user_id !== before.assignedUserId
  ) {
    await recordEvent({
      action: "mail.assigned",
      actorUserId: actor.userId,
      targetType: "mail_thread",
      targetId: threadId,
      payload: { assigned_user_id: patch.assigned_user_id },
    })
  }
}

export async function updateMailThread(
  actor: Actor,
  threadId: string,
  patch: MailThreadPatch
): Promise<MailThreadDetail | null> {
  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: { id: true, status: true, assignedUserId: true },
  })

  if (!thread) {
    return null
  }

  if (patch.assigned_user_id) {
    await assertOnTheTeam(patch.assigned_user_id)
  }

  await prisma.mailThread.update({
    where: { id: threadId },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.unread === undefined ? {} : { unread: patch.unread }),
      ...(patch.assigned_user_id === undefined
        ? {}
        : { assignedUserId: patch.assigned_user_id }),
    },
  })
  await recordThreadChanges(actor, threadId, thread, patch)

  return await readMailThread(threadId)
}
