import type { Prisma } from "@pupitre/db/cloudflare/client"
import { MAIL_READ_AUDIT_WINDOW_MS } from "@pupitre/shared/legal"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import {
  listMailActivities,
  type MailActivityView,
  recordMailActivity,
} from "./activity"
import { type MailDraftView, readMailDraft } from "./drafts"
import { listMailNotes, type MailNoteView } from "./notes"
import { publishInboxEvent } from "./realtime"

export const MAIL_PAGE_SIZE = 50

export const MAIL_MAX_PAGE_SIZE = 200

export const MAIL_BULK_MAX = 100

export const MAIL_THREAD_SORTS = [
  "last_activity",
  "last_inbound_at",
  "created_at",
  "subject",
] as const

export type MailThreadSort = (typeof MAIL_THREAD_SORTS)[number]

export type MailSortDirection = "asc" | "desc"

export type MailThreadStatus = "open" | "closed"

/** The rail's own value for the threads no declared mailbox claims. */
export const MAILBOX_OTHERS = "others"

/** `me`, `none`, or the identifier of the person the thread is assigned to. */
export type MailAssignedFilter = string

export interface MailThreadFilter {
  viewerId: string
  status?: MailThreadStatus
  unread?: boolean
  q?: string
  address?: string
  mailboxId?: string
  organizationId?: string
  automated?: boolean
  assigned?: MailAssignedFilter
  sort?: MailThreadSort
  direction?: MailSortDirection
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
  linked_organization_id?: string | null
}

export interface MailBulkPatch {
  status?: MailThreadStatus
  unread?: boolean
}

export class MailAssigneeNotOnTheTeamError extends Error {
  readonly userId: string

  constructor(userId: string) {
    super(`${userId} is not a member of the platform organization`)
    this.name = "MailAssigneeNotOnTheTeamError"
    this.userId = userId
  }
}

export class MailOrganizationUnknownError extends Error {
  readonly organizationId: string

  constructor(organizationId: string) {
    super(`${organizationId} is not an organization`)
    this.name = "MailOrganizationUnknownError"
    this.organizationId = organizationId
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

const THREAD_INCLUDE = {
  mailbox: true,
  linkedOrganization: { select: { id: true, name: true, slug: true } },
  draft: { select: { threadId: true } },
  _count: { select: { notes: true } },
} as const

type ThreadRow = Prisma.MailThreadGetPayload<{ include: typeof THREAD_INCLUDE }>

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

function mailboxWhere(
  mailboxId: string | undefined
): Prisma.MailThreadWhereInput {
  if (!mailboxId) {
    return {}
  }

  return mailboxId === MAILBOX_OTHERS ? { mailboxId: null } : { mailboxId }
}

function searchWhere(q: string): Prisma.MailThreadWhereInput {
  return {
    OR: [
      { id: { contains: q } },
      { subject: { contains: q } },
      {
        messages: {
          some: {
            OR: [
              { fromEmail: { contains: q } },
              { fromName: { contains: q } },
              { text: { contains: q } },
            ],
          },
        },
      },
    ],
  }
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
    ...mailboxWhere(filter.mailboxId),
    ...(filter.organizationId
      ? { linkedOrganizationId: filter.organizationId }
      : {}),
    lastInboundAutomated: filter.automated ?? false,
    ...assignedWhere(filter.assigned, filter.viewerId),
    ...(q ? searchWhere(q) : {}),
  }
}

const SORT_COLUMNS: Record<MailThreadSort, string> = {
  last_activity: "updatedAt",
  last_inbound_at: "lastInboundAt",
  created_at: "createdAt",
  subject: "subject",
}

function orderOf(
  filter: MailThreadFilter
): Prisma.MailThreadOrderByWithRelationInput {
  const column = SORT_COLUMNS[filter.sort ?? "last_activity"]

  return { [column]: filter.direction ?? "desc" }
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

function mailboxRefOf(mailbox: ThreadRow["mailbox"]): MailMailboxRef | null {
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

function viewOf(
  thread: ThreadRow,
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
    mailbox_id: thread.mailboxId,
    subject: thread.subject,
    status: thread.status,
    unread: thread.unread,
    assigned_user: assigned,
    contact: contact
      ? { user_id: contact.id, email: contact.email, name: contact.name }
      : null,
    linked_organization: thread.linkedOrganization,
    from: senderOf(messages),
    snippet: messages.at(-1)?.snippet ?? null,
    messages: messages.length,
    notes: thread._count.notes,
    has_draft: thread.draft !== null,
    automated: thread.lastInboundAutomated,
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
      include: THREAD_INCLUDE,
      orderBy: orderOf(filter),
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

/** The thread opened: what the list only counts — messages and notes — is carried here. */
export type MailThreadDetail = Omit<MailThreadView, "messages" | "notes"> & {
  mailbox: MailMailboxRef | null
  messages: MailMessageView[]
  notes: MailNoteView[]
  activities: MailActivityView[]
  draft: MailDraftView | null
}

export async function readMailThread(
  threadId: string
): Promise<MailThreadDetail | null> {
  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    include: THREAD_INCLUDE,
  })

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
  const [notes, activities, draft] = await Promise.all([
    listMailNotes(threadId),
    listMailActivities(threadId),
    readMailDraft(threadId),
  ])
  const summary = viewOf(thread, summaries, people)

  return {
    ...summary,
    mailbox: mailboxRefOf(thread.mailbox),
    notes,
    activities,
    draft,
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

async function assertOrganization(organizationId: string): Promise<void> {
  const organization = await getPrisma().organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  })

  if (!organization) {
    throw new MailOrganizationUnknownError(organizationId)
  }
}

interface ThreadBefore {
  status: string
  unread: boolean
  assignedUserId: string | null
  linkedOrganizationId: string | null
}

async function recordStatusChange(
  actor: Actor,
  threadId: string,
  before: ThreadBefore,
  patch: MailThreadPatch
): Promise<void> {
  if (!patch.status || patch.status === before.status) {
    return
  }

  const closed = patch.status === "closed"

  await recordEvent({
    action: closed ? "mail.closed" : "mail.reopened",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: threadId,
  })
  await recordMailActivity({
    threadId,
    action: closed ? "closed" : "reopened",
    actorUserId: actor.userId,
  })
}

async function recordAssignment(
  actor: Actor,
  threadId: string,
  before: ThreadBefore,
  patch: MailThreadPatch
): Promise<void> {
  if (
    patch.assigned_user_id === undefined ||
    patch.assigned_user_id === before.assignedUserId
  ) {
    return
  }

  await recordEvent({
    action: "mail.assigned",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: threadId,
    payload: { assigned_user_id: patch.assigned_user_id },
  })
  await recordMailActivity({
    threadId,
    action: patch.assigned_user_id ? "assigned" : "unassigned",
    actorUserId: actor.userId,
    metadata: { assigned_user_id: patch.assigned_user_id },
  })
}

async function recordLink(
  actor: Actor,
  threadId: string,
  before: ThreadBefore,
  patch: MailThreadPatch
): Promise<void> {
  if (
    patch.linked_organization_id === undefined ||
    patch.linked_organization_id === before.linkedOrganizationId
  ) {
    return
  }

  await recordEvent({
    action: "mail.linked",
    actorUserId: actor.userId,
    organizationId: patch.linked_organization_id,
    targetType: "mail_thread",
    targetId: threadId,
    payload: { organization_id: patch.linked_organization_id },
  })
  await recordMailActivity({
    threadId,
    action: patch.linked_organization_id ? "linked" : "unlinked",
    actorUserId: actor.userId,
    metadata: { organization_id: patch.linked_organization_id },
  })
}

async function recordReadState(
  actor: Actor,
  threadId: string,
  before: ThreadBefore,
  patch: MailThreadPatch
): Promise<void> {
  if (patch.unread === undefined || patch.unread === before.unread) {
    return
  }

  await recordMailActivity({
    threadId,
    action: patch.unread ? "unread" : "read",
    actorUserId: actor.userId,
  })
}

export async function updateMailThread(
  actor: Actor,
  threadId: string,
  patch: MailThreadPatch
): Promise<MailThreadDetail | null> {
  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      status: true,
      unread: true,
      assignedUserId: true,
      linkedOrganizationId: true,
      mailboxId: true,
    },
  })

  if (!thread) {
    return null
  }

  if (patch.assigned_user_id) {
    await assertOnTheTeam(patch.assigned_user_id)
  }

  if (patch.linked_organization_id) {
    await assertOrganization(patch.linked_organization_id)
  }

  await prisma.mailThread.update({
    where: { id: threadId },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.unread === undefined ? {} : { unread: patch.unread }),
      ...(patch.assigned_user_id === undefined
        ? {}
        : { assignedUserId: patch.assigned_user_id }),
      ...(patch.linked_organization_id === undefined
        ? {}
        : { linkedOrganizationId: patch.linked_organization_id }),
    },
  })

  await recordStatusChange(actor, threadId, thread, patch)
  await recordAssignment(actor, threadId, thread, patch)
  await recordLink(actor, threadId, thread, patch)
  await recordReadState(actor, threadId, thread, patch)
  await publishInboxEvent({
    type: "thread.updated",
    thread_id: threadId,
    mailbox_id: thread.mailboxId,
  })

  return await readMailThread(threadId)
}

export async function bulkUpdateMailThreads(
  actor: Actor,
  threadIds: string[],
  patch: MailBulkPatch
): Promise<number> {
  const prisma = getPrisma()
  const threads = await prisma.mailThread.findMany({
    where: { id: { in: threadIds } },
    select: { id: true, status: true, unread: true },
  })

  if (threads.length === 0) {
    return 0
  }

  await prisma.mailThread.updateMany({
    where: { id: { in: threads.map((thread) => thread.id) } },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.unread === undefined ? {} : { unread: patch.unread }),
    },
  })

  for (const thread of threads) {
    if (patch.status && patch.status !== thread.status) {
      await recordMailActivity({
        threadId: thread.id,
        action: patch.status === "closed" ? "closed" : "reopened",
        actorUserId: actor.userId,
      })
    }

    if (patch.unread !== undefined && patch.unread !== thread.unread) {
      await recordMailActivity({
        threadId: thread.id,
        action: patch.unread ? "unread" : "read",
        actorUserId: actor.userId,
      })
    }
  }

  if (patch.status) {
    await recordEvent({
      action: "mail.bulk_closed",
      actorUserId: actor.userId,
      targetType: "mail_thread",
      targetId: threads[0].id,
      payload: { status: patch.status, threads: threads.length },
    })
  }

  if (patch.unread !== undefined) {
    await recordEvent({
      action: "mail.bulk_read",
      actorUserId: actor.userId,
      targetType: "mail_thread",
      targetId: threads[0].id,
      payload: { unread: patch.unread, threads: threads.length },
    })
  }

  await publishInboxEvent({ type: "counts.changed" })

  return threads.length
}

async function readAlreadyJournalled(
  actorUserId: string | null,
  threadId: string
): Promise<boolean> {
  const since = new Date(Date.now() - MAIL_READ_AUDIT_WINDOW_MS)
  const previous = await getPrisma().event.findFirst({
    where: {
      action: "mail.read",
      actorUserId,
      targetType: "mail_thread",
      targetId: threadId,
      createdAt: { gte: since },
    },
    select: { id: true },
  })

  return previous !== null
}

/**
 * Opening a sensitive box is itself an act: who read a report sent to
 * `security@`, and when. An ordinary box records nothing.
 *
 * One line per reader and per window: the console refetches the open thread
 * on every frame it receives, and each refetch is the same reading.
 */
export async function noteSensitiveThreadRead(
  actor: Actor,
  thread: MailThreadDetail
): Promise<void> {
  if (!thread.mailbox?.sensitive) {
    return
  }

  if (await readAlreadyJournalled(actor.userId, thread.id)) {
    return
  }

  await recordEvent({
    action: "mail.read",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: thread.id,
    payload: { mailbox_id: thread.mailbox.id },
  })
  await recordMailActivity({
    threadId: thread.id,
    action: "read",
    actorUserId: actor.userId,
  })
}

export interface MailAttachmentOrigin {
  threadId: string
  mailboxId: string | null
  sensitive: boolean
}

export async function attachmentOrigin(
  attachmentId: string
): Promise<MailAttachmentOrigin | null> {
  const attachment = await getPrisma().mailAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      message: {
        select: {
          threadId: true,
          thread: {
            select: {
              mailboxId: true,
              mailbox: { select: { sensitive: true } },
            },
          },
        },
      },
    },
  })

  if (!attachment) {
    return null
  }

  return {
    threadId: attachment.message.threadId,
    mailboxId: attachment.message.thread.mailboxId,
    sensitive: attachment.message.thread.mailbox?.sensitive ?? false,
  }
}
