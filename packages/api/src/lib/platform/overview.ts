import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import { LAUNCH_PRODUCT, PLATFORM_PRODUCTS } from "@pupitre/shared/plans"
import { TRIAL_WARN_DAYS, WORKLIST_ITEMS } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { PAYING_SUBSCRIPTION_STATUSES, SEATED_STATUSES } from "../billing/seats"

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

export interface WorklistOrganization {
  id: string
  name: string
  slug: string
}

export interface UnreadMailItem {
  id: string
  subject: string
  address: string
  from: { email: string; name: string | null }
  last_inbound_at: Date | null
}

export interface SubscriptionWorklistItem {
  id: string
  organization: WorklistOrganization
  status: string
  current_period_end: Date | null
}

export interface UnreachableServerItem {
  id: string
  name: string
  host: string | null
  organization: { id: string; name: string }
  last_heartbeat_at: Date | null
}

export interface SeatDriftItem {
  organization: WorklistOrganization
  paid: number
  used: number
}

export type ScheduledDeletionKind = "user" | "organization"

export interface ScheduledDeletionItem {
  kind: ScheduledDeletionKind
  id: string
  label: string
  deletion_at: Date
}

export interface Worklist<Item> {
  count: number
  items: Item[]
}

export interface PlatformWorklists {
  unread_mail: Worklist<UnreadMailItem>
  past_due: Worklist<SubscriptionWorklistItem>
  trials_ending: Worklist<SubscriptionWorklistItem>
  servers_unreachable: Worklist<UnreachableServerItem>
  seats_drifted: Worklist<SeatDriftItem>
  deletions_scheduled: Worklist<ScheduledDeletionItem>
}

export interface PlatformOverview {
  users: number
  organizations: number
  servers: ServerCounts
  subscriptions: SubscriptionCounts
  affiliate_links: number
  referrals: number
  worklists: PlatformWorklists
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

const ORGANIZATION_SELECT = {
  select: { id: true, name: true, slug: true },
} as const

async function readUnreadMail(): Promise<Worklist<UnreadMailItem>> {
  const prisma = getPrisma()
  const [threads, count] = await Promise.all([
    prisma.mailThread.findMany({
      where: { unread: true },
      orderBy: { updatedAt: "desc" },
      take: WORKLIST_ITEMS,
      include: {
        messages: {
          where: { direction: "inbound" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { fromEmail: true, fromName: true },
        },
      },
    }),
    prisma.mailThread.count({ where: { unread: true } }),
  ])

  return {
    count,
    items: threads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      address: thread.address,
      from: {
        email: thread.messages[0]?.fromEmail ?? thread.address,
        name: thread.messages[0]?.fromName ?? null,
      },
      last_inbound_at: thread.lastInboundAt,
    })),
  }
}

async function readSubscriptionWorklist(
  where: { status: string } & Record<string, unknown>
): Promise<Worklist<SubscriptionWorklistItem>> {
  const prisma = getPrisma()
  const [rows, count] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { currentPeriodEnd: "asc" },
      take: WORKLIST_ITEMS,
      include: { organization: ORGANIZATION_SELECT },
    }),
    prisma.subscription.count({ where }),
  ])

  return {
    count,
    items: rows.map((row) => ({
      id: row.id,
      organization: row.organization,
      status: row.status,
      current_period_end: row.currentPeriodEnd,
    })),
  }
}

function trialDeadline(now: Date): Date {
  const deadline = new Date(now)

  deadline.setDate(deadline.getDate() + TRIAL_WARN_DAYS)

  return deadline
}

async function readUnreachableServers(): Promise<
  Worklist<UnreachableServerItem>
> {
  const prisma = getPrisma()
  const where = { kind: "server_unreachable", resolvedAt: null } as const
  const [alerts, count] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { firstSeenAt: "asc" },
      take: WORKLIST_ITEMS,
      include: {
        server: {
          select: {
            id: true,
            name: true,
            host: true,
            lastHeartbeatAt: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.alert.count({ where }),
  ])

  return {
    count,
    items: alerts.map((alert) => ({
      id: alert.server.id,
      name: alert.server.name,
      host: alert.server.host,
      organization: alert.server.organization,
      last_heartbeat_at: alert.server.lastHeartbeatAt,
    })),
  }
}

/** The same count as `reconcileSeats`, read only: seated servers over the seats the organisation pays. */
async function readSeatDrift(): Promise<Worklist<SeatDriftItem>> {
  const prisma = getPrisma()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: PAYING_SUBSCRIPTION_STATUSES },
      product: { notIn: [...PLATFORM_PRODUCTS] },
    },
    orderBy: { createdAt: "asc" },
    include: { organization: ORGANIZATION_SELECT },
  })

  if (subscriptions.length === 0) {
    return { count: 0, items: [] }
  }

  const seats = await prisma.server.groupBy({
    by: ["organizationId"],
    where: {
      status: { in: SEATED_STATUSES },
      organizationId: {
        in: subscriptions.map((subscription) => subscription.organizationId),
      },
    },
    _count: { _all: true },
  })
  const seatedByOrganization = new Map(
    seats.map((row) => [row.organizationId, row._count._all])
  )
  const drifted = subscriptions
    .map((subscription) => ({
      organization: subscription.organization,
      paid: subscription.quantity,
      used: seatedByOrganization.get(subscription.organizationId) ?? 0,
    }))
    .filter((row) => row.used > row.paid)

  return { count: drifted.length, items: drifted.slice(0, WORKLIST_ITEMS) }
}

interface DeletionRow {
  id: string
  label: string
  deletionAt: Date | null
}

function scheduledItems(
  kind: ScheduledDeletionKind,
  rows: DeletionRow[]
): ScheduledDeletionItem[] {
  return rows.flatMap((row) =>
    row.deletionAt
      ? [{ kind, id: row.id, label: row.label, deletion_at: row.deletionAt }]
      : []
  )
}

/** Accounts and organisations share one list: what the team has to cancel before the rows go. */
async function readScheduledDeletions(): Promise<
  Worklist<ScheduledDeletionItem>
> {
  const prisma = getPrisma()
  const where = { deletionAt: { not: null } }
  const page = {
    where,
    orderBy: { deletionAt: "asc" },
    take: WORKLIST_ITEMS,
  } as const
  const [users, organizations, userCount, organizationCount] =
    await Promise.all([
      prisma.user.findMany({
        ...page,
        select: { id: true, email: true, deletionAt: true },
      }),
      prisma.organization.findMany({
        ...page,
        select: { id: true, name: true, deletionAt: true },
      }),
      prisma.user.count({ where }),
      prisma.organization.count({ where }),
    ])
  const items = [
    ...scheduledItems(
      "user",
      users.map((user) => ({ ...user, label: user.email }))
    ),
    ...scheduledItems(
      "organization",
      organizations.map((organization) => ({
        ...organization,
        label: organization.name,
      }))
    ),
  ].sort(
    (left, right) => left.deletion_at.getTime() - right.deletion_at.getTime()
  )

  return {
    count: userCount + organizationCount,
    items: items.slice(0, WORKLIST_ITEMS),
  }
}

export async function readPlatformWorklists(): Promise<PlatformWorklists> {
  const now = new Date()
  const [
    unreadMail,
    pastDue,
    trialsEnding,
    unreachable,
    seatsDrifted,
    deletions,
  ] = await Promise.all([
    readUnreadMail(),
    readSubscriptionWorklist({ status: "past_due" }),
    readSubscriptionWorklist({
      status: "trialing",
      currentPeriodEnd: { not: null, lte: trialDeadline(now) },
    }),
    readUnreachableServers(),
    readSeatDrift(),
    readScheduledDeletions(),
  ])

  return {
    unread_mail: unreadMail,
    past_due: pastDue,
    trials_ending: trialsEnding,
    servers_unreachable: unreachable,
    seats_drifted: seatsDrifted,
    deletions_scheduled: deletions,
  }
}

export async function readPlatformOverview(): Promise<PlatformOverview> {
  const prisma = getPrisma()
  const [
    users,
    organizations,
    servers,
    subscriptions,
    links,
    referrals,
    worklists,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    countServers(),
    countSubscriptions(),
    prisma.affiliateLink.count(),
    prisma.referral.count(),
    readPlatformWorklists(),
  ])

  return {
    users,
    organizations,
    servers,
    subscriptions,
    affiliate_links: links,
    referrals,
    worklists,
  }
}
