import type {
  Prisma,
  StripeEventStatus,
  Subscription,
} from "@pupitre/db/cloudflare/client"
import {
  isPlatformProduct,
  PLATFORM_PRODUCTS,
  STRIPE_PRODUCT,
} from "@pupitre/shared/plans"
import { getPrisma } from "../api/prisma"
import { stripeSubscriptionUrl } from "../billing/config"
import { SEATED_STATUSES } from "../billing/seats"
import { liveAmong } from "../billing/subscription"
import { type AdminEventView, RECENT_EVENTS, recentEvents } from "./events"
import {
  type AdminOrganizationSubscriptionRow,
  toSubscriptionRow,
} from "./organizations"

export const ADMIN_SUBSCRIPTION_SORTS = [
  "created_at",
  "current_period_end",
  "updated_at",
] as const

export type AdminSubscriptionSort = (typeof ADMIN_SUBSCRIPTION_SORTS)[number]

export interface AdminSubscriptionOrganization {
  id: string
  name: string
  slug: string
}

export interface AdminSubscriptionSeats {
  paid: number
  used: number
}

export interface AdminSubscriptionView
  extends AdminOrganizationSubscriptionRow {
  organization: AdminSubscriptionOrganization
  live: boolean
  seats: AdminSubscriptionSeats
  /** The row that counts pays for fewer servers than the organisation seats: the reading of `ReconcileSeats`. */
  drifted: boolean
}

export interface AdminStripeEventView {
  id: string
  type: string
  status: StripeEventStatus
  received_at: Date
}

export interface AdminSubscriptionDetail extends AdminSubscriptionView {
  stripe_url: string | null
  stripe_events: AdminStripeEventView[]
  events: AdminEventView[]
}

export interface AdminSubscriptionFilter {
  status?: string
  product?: string
  organization_id?: string
  live?: boolean
  drifted?: boolean
  q?: string
  sort?: AdminSubscriptionSort
  direction?: "asc" | "desc"
  limit: number
  offset: number
}

export interface AdminSubscriptionPage {
  data: AdminSubscriptionView[]
  total: number
}

const ORGANIZATION_INCLUDE = {
  organization: { select: { id: true, name: true, slug: true } },
} as const

type SubscriptionWithOrganization = Prisma.SubscriptionGetPayload<{
  include: typeof ORGANIZATION_INCLUDE
}>

function productWhere(
  product: string | undefined
): Prisma.SubscriptionWhereInput {
  if (!product) {
    return {}
  }

  return product === STRIPE_PRODUCT
    ? { product: { notIn: [...PLATFORM_PRODUCTS] } }
    : { product }
}

function whereOf(
  filter: AdminSubscriptionFilter
): Prisma.SubscriptionWhereInput {
  const q = filter.q?.trim()

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...productWhere(filter.product),
    ...(filter.organization_id
      ? { organizationId: filter.organization_id }
      : {}),
    ...(q
      ? {
          OR: [
            { stripeSubscriptionId: { contains: q } },
            { organization: { name: { contains: q } } },
            { organization: { slug: { contains: q } } },
          ],
        }
      : {}),
  }
}

function orderOf(
  filter: AdminSubscriptionFilter
): Prisma.SubscriptionOrderByWithRelationInput {
  const direction = filter.direction ?? "desc"

  if (filter.sort === "current_period_end") {
    return { currentPeriodEnd: direction }
  }

  if (filter.sort === "updated_at") {
    return { updatedAt: direction }
  }

  return { createdAt: direction }
}

/**
 * Which of these rows is the one that counts for its organization: the same
 * choice as `/me`, read once for the whole page rather than once per row.
 */
async function liveIdsAmong(organizationIds: string[]): Promise<Set<string>> {
  if (organizationIds.length === 0) {
    return new Set()
  }

  const rows = await getPrisma().subscription.findMany({
    where: { organizationId: { in: organizationIds } },
    orderBy: { updatedAt: "desc" },
  })
  const byOrganization = new Map<string, Subscription[]>()

  for (const row of rows) {
    const kept = byOrganization.get(row.organizationId) ?? []

    kept.push(row)
    byOrganization.set(row.organizationId, kept)
  }

  const live = new Set<string>()

  for (const subscriptions of byOrganization.values()) {
    const counted = liveAmong(subscriptions)

    if (counted) {
      live.add(counted.id)
    }
  }

  return live
}

/** How many servers each of these organisations has seated, counted once for the page. */
async function seatsUsedAmong(
  organizationIds: string[]
): Promise<Map<string, number>> {
  if (organizationIds.length === 0) {
    return new Map()
  }

  const rows = await getPrisma().server.groupBy({
    by: ["organizationId"],
    where: {
      organizationId: { in: organizationIds },
      status: { in: SEATED_STATUSES },
    },
    _count: { _all: true },
  })

  return new Map(rows.map((row) => [row.organizationId, row._count._all]))
}

/** Only the row an organisation is billed on can be short of seats; a closed one owes nothing. */
function isDrifted(
  subscription: { id: string; organizationId: string; quantity: number },
  live: Set<string>,
  used: Map<string, number>
): boolean {
  return (
    live.has(subscription.id) &&
    (used.get(subscription.organizationId) ?? 0) > subscription.quantity
  )
}

function toView(
  subscription: SubscriptionWithOrganization,
  live: Set<string>,
  used: Map<string, number>
): AdminSubscriptionView {
  return {
    ...toSubscriptionRow(subscription),
    organization: subscription.organization,
    live: live.has(subscription.id),
    seats: {
      paid: subscription.quantity,
      used: used.get(subscription.organizationId) ?? 0,
    },
    drifted: isDrifted(subscription, live, used),
  }
}

/**
 * Which row counts, and which is short of seats, are choices made across an
 * organization and not columns: they are resolved over everything the other
 * filters keep, then narrowed by identifier, so the count and the page agree.
 */
async function narrowBeyondColumns(
  where: Prisma.SubscriptionWhereInput,
  filter: AdminSubscriptionFilter
): Promise<Prisma.SubscriptionWhereInput> {
  const matching = await getPrisma().subscription.findMany({
    where,
    select: { id: true, organizationId: true, quantity: true },
  })
  const organizationIds = [
    ...new Set(matching.map((row) => row.organizationId)),
  ]
  const [live, used] = await Promise.all([
    liveIdsAmong(organizationIds),
    seatsUsedAmong(organizationIds),
  ])
  const kept = matching.filter((row) => {
    if (filter.live !== undefined && live.has(row.id) !== filter.live) {
      return false
    }

    return (
      filter.drifted === undefined ||
      isDrifted(row, live, used) === filter.drifted
    )
  })

  return { ...where, id: { in: kept.map((row) => row.id) } }
}

export async function listSubscriptionsForPlatform(
  filter: AdminSubscriptionFilter
): Promise<AdminSubscriptionPage> {
  const prisma = getPrisma()
  const filtered = whereOf(filter)
  const where =
    filter.live === undefined && filter.drifted === undefined
      ? filtered
      : await narrowBeyondColumns(filtered, filter)
  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: orderOf(filter),
      take: filter.limit,
      skip: filter.offset,
      include: ORGANIZATION_INCLUDE,
    }),
    prisma.subscription.count({ where }),
  ])
  const organizationIds = [
    ...new Set(
      subscriptions.map((subscription) => subscription.organizationId)
    ),
  ]
  const [live, used] = await Promise.all([
    liveIdsAmong(organizationIds),
    seatsUsedAmong(organizationIds),
  ])

  return {
    data: subscriptions.map((subscription) => toView(subscription, live, used)),
    total,
  }
}

async function viewOf(
  subscription: SubscriptionWithOrganization
): Promise<AdminSubscriptionView> {
  const [live, used] = await Promise.all([
    liveIdsAmong([subscription.organizationId]),
    seatsUsedAmong([subscription.organizationId]),
  ])

  return toView(subscription, live, used)
}

/** The row a write just left: what the console shows back after a gesture. */
export async function viewWrittenSubscription(
  subscriptionId: string
): Promise<AdminSubscriptionView> {
  return await viewOf(
    await getPrisma().subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: ORGANIZATION_INCLUDE,
    })
  )
}

/** The deliveries that named this subscription, as the webhook filed them. */
function stripeEventsOf(
  stripeSubscriptionId: string
): Promise<AdminStripeEventView[]> {
  return getPrisma()
    .stripeEvent.findMany({
      where: { subscriptionId: stripeSubscriptionId },
      orderBy: { receivedAt: "desc" },
      take: RECENT_EVENTS,
      select: { id: true, type: true, status: true, receivedAt: true },
    })
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        received_at: row.receivedAt,
      }))
    )
}

export async function readSubscriptionForPlatform(
  subscriptionId: string
): Promise<AdminSubscriptionDetail | null> {
  const subscription = await getPrisma().subscription.findUnique({
    where: { id: subscriptionId },
    include: ORGANIZATION_INCLUDE,
  })

  if (!subscription) {
    return null
  }

  const platform = isPlatformProduct(subscription.product)
  const [view, events, stripeEvents] = await Promise.all([
    viewOf(subscription),
    recentEvents({
      targetType: "subscription",
      targetId: subscription.stripeSubscriptionId,
    }),
    platform
      ? Promise.resolve<AdminStripeEventView[]>([])
      : stripeEventsOf(subscription.stripeSubscriptionId),
  ])

  return {
    ...view,
    stripe_url: platform
      ? null
      : stripeSubscriptionUrl(subscription.stripeSubscriptionId),
    stripe_events: stripeEvents,
    events,
  }
}
