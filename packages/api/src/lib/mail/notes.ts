import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import { recordMailActivity } from "./activity"
import { publishInboxEvent } from "./realtime"

export const MAIL_NOTE_MAX_LENGTH = 10_000

export interface MailNoteView {
  id: string
  body: string
  author: { id: string; name: string } | null
  created_at: Date
  updated_at: Date
}

interface NoteRow {
  id: string
  body: string
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
}

async function authorsOf(
  notes: NoteRow[]
): Promise<Map<string, { id: string; name: string }>> {
  const ids = [...new Set(notes.map((note) => note.createdByUserId))]

  if (ids.length === 0) {
    return new Map()
  }

  const users = await getPrisma().user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })

  return new Map(users.map((user) => [user.id, user]))
}

function viewOf(
  note: NoteRow,
  authors: Map<string, { id: string; name: string }>
): MailNoteView {
  return {
    id: note.id,
    body: note.body,
    author: authors.get(note.createdByUserId) ?? null,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  }
}

export async function listMailNotes(threadId: string): Promise<MailNoteView[]> {
  const notes = await getPrisma().mailNote.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  })
  const authors = await authorsOf(notes)

  return notes.map((note) => viewOf(note, authors))
}

export async function createMailNote(
  actor: Actor & { userId: string },
  threadId: string,
  body: string
): Promise<MailNoteView | null> {
  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: { id: true, mailboxId: true },
  })

  if (!thread) {
    return null
  }

  const note = await prisma.mailNote.create({
    data: { threadId, body, createdByUserId: actor.userId },
  })

  await recordMailActivity({
    threadId,
    action: "note_added",
    actorUserId: actor.userId,
  })
  await recordEvent({
    action: "mail.note_added",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: threadId,
  })
  await publishInboxEvent({
    type: "thread.updated",
    thread_id: threadId,
    mailbox_id: thread.mailboxId,
  })

  const authors = await authorsOf([note])

  return viewOf(note, authors)
}

export async function deleteMailNote(
  actor: Actor & { userId: string },
  threadId: string,
  noteId: string
): Promise<boolean> {
  const prisma = getPrisma()
  const note = await prisma.mailNote.findFirst({
    where: { id: noteId, threadId },
    select: { id: true },
  })

  if (!note) {
    return false
  }

  await prisma.mailNote.delete({ where: { id: noteId } })

  await recordMailActivity({
    threadId,
    action: "note_deleted",
    actorUserId: actor.userId,
  })
  await recordEvent({
    action: "mail.note_deleted",
    actorUserId: actor.userId,
    targetType: "mail_thread",
    targetId: threadId,
  })
  await publishInboxEvent({ type: "thread.updated", thread_id: threadId })

  return true
}
