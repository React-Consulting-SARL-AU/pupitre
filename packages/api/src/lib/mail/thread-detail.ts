import { MAIL_READ_AUDIT_WINDOW_MS } from "@pupitre/shared/legal"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import {
  listMailActivities,
  type MailActivityView,
  recordMailActivity,
} from "./activity"
import { type MailDraftView, readMailDraft } from "./drafts"
import { listMailNotes, type MailNoteView } from "./notes"
import {
  type MailMailboxRef,
  type MailMessageView,
  type MailThreadView,
  MESSAGE_VIEW_SELECT,
  mailboxRefOf,
  messageViewOf,
  peopleNamed,
  THREAD_INCLUDE,
  threadViewOf,
} from "./thread-view"

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

  const [messages, notes, activities, draft] = await Promise.all([
    prisma.mailMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      select: MESSAGE_VIEW_SELECT,
    }),
    listMailNotes(threadId),
    listMailActivities(threadId),
    readMailDraft(threadId),
  ])

  const people = await peopleNamed([
    thread.assignedUserId,
    thread.contactUserId,
    ...messages.map((message) => message.sentByUserId),
  ])

  return {
    ...threadViewOf(thread, people),
    mailbox: mailboxRefOf(thread.mailbox),
    messages: messages.map((message) => messageViewOf(message, people)),
    notes,
    activities,
    draft,
  }
}

export async function readMailMessage(
  messageId: string
): Promise<MailMessageView | null> {
  const message = await getPrisma().mailMessage.findUnique({
    where: { id: messageId },
    select: MESSAGE_VIEW_SELECT,
  })

  if (!message) {
    return null
  }

  return messageViewOf(message, await peopleNamed([message.sentByUserId]))
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

/** Audits reads of sensitive mailboxes once per reader and window: the console refetches on every frame. */
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
