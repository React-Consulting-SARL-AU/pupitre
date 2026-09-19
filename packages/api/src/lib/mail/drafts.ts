import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import type { Actor } from "../audit/audit"
import { publishInboxEvent } from "./realtime"
import type { MailAttachmentInput } from "./uploads"

export const MAIL_DRAFT_MAX_LENGTH = 20_000

export interface MailDraftView {
  body: string
  to: string[]
  cc: string[]
  attachments: MailAttachmentInput[]
  updated_by: { id: string; name: string } | null
  updated_at: Date
}

export interface MailDraftInput {
  body: string
  to?: string[]
  cc?: string[]
  attachments?: MailAttachmentInput[]
}

interface DraftRow {
  body: string
  to: unknown
  cc: unknown
  attachments: unknown
  updatedByUserId: string
  updatedAt: Date
}

function attachmentList(value: unknown): MailAttachmentInput[] {
  return Array.isArray(value) ? (value as MailAttachmentInput[]) : []
}

function addressList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

async function viewOf(draft: DraftRow): Promise<MailDraftView> {
  const author = await getPrisma().user.findUnique({
    where: { id: draft.updatedByUserId },
    select: { id: true, name: true },
  })

  return {
    body: draft.body,
    to: addressList(draft.to),
    cc: addressList(draft.cc),
    attachments: attachmentList(draft.attachments),
    updated_by: author,
    updated_at: draft.updatedAt,
  }
}

export async function readMailDraft(
  threadId: string
): Promise<MailDraftView | null> {
  const draft = await getPrisma().mailDraft.findUnique({ where: { threadId } })

  return draft ? await viewOf(draft) : null
}

export async function saveMailDraft(
  actor: Actor & { userId: string },
  threadId: string,
  input: MailDraftInput
): Promise<MailDraftView | null> {
  const prisma = getPrisma()
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: { id: true },
  })

  if (!thread) {
    return null
  }

  const data = {
    body: input.body,
    to: input.to ?? [],
    cc: input.cc ?? [],
    attachments: (input.attachments ?? []) as unknown as Prisma.InputJsonValue,
    updatedByUserId: actor.userId,
  }
  const draft = await prisma.mailDraft.upsert({
    where: { threadId },
    update: data,
    create: { threadId, ...data },
  })

  await publishInboxEvent({ type: "draft.changed", thread_id: threadId })

  return await viewOf(draft)
}

export async function deleteMailDraft(threadId: string): Promise<boolean> {
  const { count } = await getPrisma().mailDraft.deleteMany({
    where: { threadId },
  })

  if (count === 0) {
    return false
  }

  await publishInboxEvent({ type: "draft.changed", thread_id: threadId })

  return true
}
