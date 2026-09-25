import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import { recordMailActivity } from "./activity"
import { publishInboxEvent } from "./realtime"
import { type MailThreadDetail, readMailThread } from "./thread-detail"
import type { MailThreadStatus } from "./threads"

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

/**
 * A thread is opened before its first message is written; when that write
 * fails, the thread goes too. One that received a message meanwhile stays.
 */
export async function discardEmptyMailThread(threadId: string): Promise<void> {
  await getPrisma().mailThread.deleteMany({
    where: { id: threadId, messages: { none: {} } },
  })
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

/**
 * `updated` counts the threads the lot really changed: closing what is already
 * closed changes nothing, and a lot that changes nothing broadcasts nothing.
 */
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

  const reclosed = threads.filter(
    (thread) => patch.status !== undefined && patch.status !== thread.status
  )
  const remarked = threads.filter(
    (thread) => patch.unread !== undefined && patch.unread !== thread.unread
  )
  const changed = threads.filter(
    (thread) => reclosed.includes(thread) || remarked.includes(thread)
  )

  if (changed.length === 0) {
    return 0
  }

  await prisma.mailThread.updateMany({
    where: { id: { in: changed.map((thread) => thread.id) } },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.unread === undefined ? {} : { unread: patch.unread }),
    },
  })

  for (const thread of reclosed) {
    await recordMailActivity({
      threadId: thread.id,
      action: patch.status === "closed" ? "closed" : "reopened",
      actorUserId: actor.userId,
    })
  }

  for (const thread of remarked) {
    await recordMailActivity({
      threadId: thread.id,
      action: patch.unread ? "unread" : "read",
      actorUserId: actor.userId,
    })
  }

  if (reclosed.length > 0) {
    await recordEvent({
      action:
        patch.status === "closed" ? "mail.bulk_closed" : "mail.bulk_reopened",
      actorUserId: actor.userId,
      targetType: "mail_thread",
      targetId: reclosed[0].id,
      payload: { status: patch.status, threads: reclosed.length },
    })
  }

  if (remarked.length > 0) {
    await recordEvent({
      action: patch.unread ? "mail.bulk_unread" : "mail.bulk_read",
      actorUserId: actor.userId,
      targetType: "mail_thread",
      targetId: remarked[0].id,
      payload: { unread: patch.unread, threads: remarked.length },
    })
  }

  await publishInboxEvent({ type: "counts.changed" })

  return changed.length
}
