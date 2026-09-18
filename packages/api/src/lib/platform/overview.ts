import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import { LAUNCH_PRODUCT } from "@pupitre/shared/plans"
import { getPrisma } from "../api/prisma"

export const OVERVIEW_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
] as const

export type OverviewSubscriptionStatus =
  (typeof OVERVIEW_SUBSCRIPTION_STATUSES)[number]

export type ServerCounts = Record<ServerStatus | "total", number>

export type SubscriptionCounts = Record<
  OverviewSubscriptionStatus | "total" | "other" | "launch",
  number
>

export interface PlatformOverview {
  users: number
  organizations: number
  servers: ServerCounts
  subscriptions: SubscriptionCounts
  affiliate_links: number
  referrals: number
}

function isOverviewStatus(
  status: string
): status is OverviewSubscriptionStatus {
  return (OVERVIEW_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
}

async function countServers(): Promise<ServerCounts> {
  const rows = await getPrisma().server.groupBy({
    by: ["status"],
    _count: { _all: true },
  })
  const counts: ServerCounts = {
    total: 0,
    enrolling: 0,
    active: 0,
    grace: 0,
    suspended: 0,
    revoked: 0,
  }

  for (const row of rows) {
    counts[row.status] = row._count._all
    counts.total += row._count._all
  }

  return counts
}

async function countSubscriptions(): Promise<SubscriptionCounts> {
  const prisma = getPrisma()
  const [rows, launch] = await Promise.all([
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscription.count({ where: { product: LAUNCH_PRODUCT } }),
  ])
  const counts: SubscriptionCounts = {
    total: 0,
    trialing: 0,
    active: 0,
    past_due: 0,
    canceled: 0,
    other: 0,
    launch,
  }

  for (const row of rows) {
    counts[isOverviewStatus(row.status) ? row.status : "other"] +=
      row._count._all
    counts.total += row._count._all
  }

  return counts
}

export async function readPlatformOverview(): Promise<PlatformOverview> {
  const prisma = getPrisma()
  const [users, organizations, servers, subscriptions, links, referrals] =
    await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      countServers(),
      countSubscriptions(),
      prisma.affiliateLink.count(),
      prisma.referral.count(),
    ])

  return {
    users,
    organizations,
    servers,
    subscriptions,
    affiliate_links: links,
    referrals,
  }
}
