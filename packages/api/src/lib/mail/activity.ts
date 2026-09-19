import type { Prisma } from "@pupitre/db/cloudflare/client"
import type { MailActivityAction } from "@pupitre/db/cloudflare/enums"
import { getPrisma } from "../api/prisma"

export type MailActivityKind = MailActivityAction

export interface MailActivityInput {
  threadId: string
  action: MailActivityKind
  actorUserId?: string | null
  metadata?: Prisma.InputJsonValue
}

export interface MailActivityView {
  id: string
  action: string
  actor: { id: string; name: string } | null
  metadata: unknown
  created_at: Date
}

export async function recordMailActivity(
  input: MailActivityInput
): Promise<void> {
  await getPrisma().mailActivity.create({
    data: {
      threadId: input.threadId,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata,
    },
  })
}

export async function listMailActivities(
  threadId: string
): Promise<MailActivityView[]> {
  const prisma = getPrisma()
  const activities = await prisma.mailActivity.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  })
  const actorIds = [
    ...new Set(
      activities
        .map((activity) => activity.actorUserId)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
  const byId = new Map(actors.map((actor) => [actor.id, actor]))

  return activities.map((activity) => ({
    id: activity.id,
    action: activity.action,
    actor: activity.actorUserId
      ? (byId.get(activity.actorUserId) ?? null)
      : null,
    metadata: activity.metadata,
    created_at: activity.createdAt,
  }))
}
