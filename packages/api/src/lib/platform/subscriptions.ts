import type { Prisma, Subscription } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import { liveAmong } from "../billing/subscription"
import {
  type AdminOrganizationSubscriptionRow,
  toSubscriptionRow,
} from "./organizations"

export interface AdminSubscriptionOrganization {
  id: string
  name: string
  slug: string
}

export interface AdminSubscriptionView
  extends AdminOrganizationSubscriptionRow {
  organization: AdminSubscriptionOrganization
  live: boolean
}

export interface AdminSubscriptionFilter {
  status?: string
  product?: string
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

function whereOf(
  filter: AdminSubscriptionFilter
): Prisma.SubscriptionWhereInput {
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.product ? { product: filter.product } : {}),
  }
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

function toView(
  subscription: SubscriptionWithOrganization,
  live: Set<string>
): AdminSubscriptionView {
  return {
    ...toSubscriptionRow(subscription),
    organization: subscription.organization,
    live: live.has(subscription.id),
  }
}

export async function listSubscriptionsForPlatform(
  filter: AdminSubscriptionFilter
): Promise<AdminSubscriptionPage> {
  const prisma = getPrisma()
  const where = whereOf(filter)
  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit,
      skip: filter.offset,
      include: ORGANIZATION_INCLUDE,
    }),
    prisma.subscription.count({ where }),
  ])
  const live = await liveIdsAmong([
    ...new Set(
      subscriptions.map((subscription) => subscription.organizationId)
    ),
  ])

  return {
    data: subscriptions.map((subscription) => toView(subscription, live)),
    total,
  }
}
