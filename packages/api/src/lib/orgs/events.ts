import { getPrisma, withOrganization } from "../api/prisma"

export const EVENTS_PAGE_SIZE = 50

export const EVENTS_MAX_PAGE_SIZE = 100

export interface EventView {
  id: string
  action: string
  actor_user_id: string | null
  actor_email: string | null
  target_type: string
  target_id: string
  payload: unknown
  created_at: Date
}

export interface EventPage {
  data: EventView[]
  total: number
}

export interface EventQuery {
  limit?: number
  offset?: number
  action?: string
}

export async function listEvents(
  organizationId: string,
  query: EventQuery = {}
): Promise<EventPage> {
  const prisma = withOrganization(getPrisma(), organizationId)
  const where = query.action ? { action: query.action } : {}
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit ?? EVENTS_PAGE_SIZE,
      skip: query.offset ?? 0,
      include: { actorUser: { select: { email: true } } },
    }),
    prisma.event.count({ where }),
  ])

  return {
    data: events.map((event) => ({
      id: event.id,
      action: event.action,
      actor_user_id: event.actorUserId,
      actor_email: event.actorUser?.email ?? null,
      target_type: event.targetType,
      target_id: event.targetId,
      payload: event.payload,
      created_at: event.createdAt,
    })),
    total,
  }
}
