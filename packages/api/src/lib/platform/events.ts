import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

export interface AdminEventOrganization {
  id: string
  name: string
  slug: string
}

export interface AdminEventActor {
  id: string
  email: string
  name: string
}

export interface AdminEventView {
  id: string
  action: string
  target_type: string
  target_id: string
  payload: unknown
  created_at: Date
  organization: AdminEventOrganization | null
  actor: AdminEventActor | null
}

export interface AdminEventFilter {
  organization_id?: string
  actor_user_id?: string
  action?: string
  target_type?: string
  limit: number
  offset: number
}

export interface AdminEventPage {
  data: AdminEventView[]
  total: number
}

export const RECENT_EVENTS = 20

const EVENT_INCLUDE = {
  organization: { select: { id: true, name: true, slug: true } },
  actorUser: { select: { id: true, email: true, name: true } },
} as const

type EventRow = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>

function toAdminEventView(event: EventRow): AdminEventView {
  return {
    id: event.id,
    action: event.action,
    target_type: event.targetType,
    target_id: event.targetId,
    payload: event.payload,
    created_at: event.createdAt,
    organization: event.organization,
    actor: event.actorUser,
  }
}

export async function recentEvents(
  where: Prisma.EventWhereInput,
  take: number = RECENT_EVENTS
): Promise<AdminEventView[]> {
  const events = await getPrisma().event.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: EVENT_INCLUDE,
  })

  return events.map(toAdminEventView)
}

function whereOf(filter: AdminEventFilter): Prisma.EventWhereInput {
  return {
    ...(filter.organization_id
      ? { organizationId: filter.organization_id }
      : {}),
    ...(filter.actor_user_id ? { actorUserId: filter.actor_user_id } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.target_type ? { targetType: filter.target_type } : {}),
  }
}

export async function listEventsForPlatform(
  filter: AdminEventFilter
): Promise<AdminEventPage> {
  const prisma = getPrisma()
  const where = whereOf(filter)
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit,
      skip: filter.offset,
      include: EVENT_INCLUDE,
    }),
    prisma.event.count({ where }),
  ])

  return { data: events.map(toAdminEventView), total }
}
