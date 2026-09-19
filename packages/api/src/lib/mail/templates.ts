import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"

export const MAIL_TEMPLATE_NAME_MAX_LENGTH = 80

export const MAIL_TEMPLATE_BODY_MAX_LENGTH = 20_000

export interface MailTemplateView {
  id: string
  name: string
  body: string
  mailbox_id: string | null
  created_at: Date
  updated_at: Date
}

export interface MailTemplateInput {
  name: string
  body: string
  mailbox_id?: string | null
}

export interface MailTemplatePatch {
  name?: string
  body?: string
  mailbox_id?: string | null
}

export class MailTemplateMailboxUnknownError extends Error {
  readonly mailboxId: string

  constructor(mailboxId: string) {
    super(`${mailboxId} is not a mailbox`)
    this.name = "MailTemplateMailboxUnknownError"
    this.mailboxId = mailboxId
  }
}

interface TemplateRow {
  id: string
  name: string
  body: string
  mailboxId: string | null
  createdAt: Date
  updatedAt: Date
}

function viewOf(template: TemplateRow): MailTemplateView {
  return {
    id: template.id,
    name: template.name,
    body: template.body,
    mailbox_id: template.mailboxId,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  }
}

async function assertMailbox(mailboxId: string | null | undefined) {
  if (!mailboxId) {
    return
  }

  const mailbox = await getPrisma().mailMailbox.findUnique({
    where: { id: mailboxId },
    select: { id: true },
  })

  if (!mailbox) {
    throw new MailTemplateMailboxUnknownError(mailboxId)
  }
}

export async function listMailTemplates(
  mailboxId?: string
): Promise<MailTemplateView[]> {
  const templates = await getPrisma().mailTemplate.findMany({
    where: mailboxId ? { OR: [{ mailboxId }, { mailboxId: null }] } : undefined,
    orderBy: { name: "asc" },
  })

  return templates.map(viewOf)
}

export async function createMailTemplate(
  actor: Actor & { userId: string },
  input: MailTemplateInput
): Promise<MailTemplateView> {
  await assertMailbox(input.mailbox_id)

  const template = await getPrisma().mailTemplate.create({
    data: {
      name: input.name,
      body: input.body,
      mailboxId: input.mailbox_id ?? null,
      createdByUserId: actor.userId,
    },
  })

  await recordEvent({
    action: "mail.template_created",
    actorUserId: actor.userId,
    targetType: "mail_template",
    targetId: template.id,
    payload: { name: template.name },
  })

  return viewOf(template)
}

export async function updateMailTemplate(
  actor: Actor & { userId: string },
  templateId: string,
  patch: MailTemplatePatch
): Promise<MailTemplateView | null> {
  const prisma = getPrisma()
  const existing = await prisma.mailTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  })

  if (!existing) {
    return null
  }

  await assertMailbox(patch.mailbox_id)

  const template = await prisma.mailTemplate.update({
    where: { id: templateId },
    data: {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.body === undefined ? {} : { body: patch.body }),
      ...(patch.mailbox_id === undefined
        ? {}
        : { mailboxId: patch.mailbox_id }),
    },
  })

  await recordEvent({
    action: "mail.template_updated",
    actorUserId: actor.userId,
    targetType: "mail_template",
    targetId: templateId,
    payload: { name: template.name },
  })

  return viewOf(template)
}

export async function deleteMailTemplate(
  actor: Actor & { userId: string },
  templateId: string
): Promise<boolean> {
  const prisma = getPrisma()
  const existing = await prisma.mailTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  })

  if (!existing) {
    return false
  }

  await prisma.mailTemplate.delete({ where: { id: templateId } })
  await recordEvent({
    action: "mail.template_deleted",
    actorUserId: actor.userId,
    targetType: "mail_template",
    targetId: templateId,
  })

  return true
}
