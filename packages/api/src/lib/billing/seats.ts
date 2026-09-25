import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import {
  isPlatformProduct,
  LIVE_SUBSCRIPTION_STATUSES,
  PLATFORM_PRODUCTS,
} from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { inBatches } from "../api/batches"
import { getPrisma, type OrganizationPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { getBillingMode, getBillingProvider } from "./runtime"
import {
  billedSubscriptionOf,
  KEPT_LAUNCH_SEAT,
  liveSubscriptionOf,
  readSubscription,
  type SubscriptionView,
} from "./subscription"

export const SEATED_STATUSES: ServerStatus[] = [
  "enrolling",
  "active",
  "grace",
  "suspended",
]

export const PAYING_SUBSCRIPTION_STATUSES = LIVE_SUBSCRIPTION_STATUSES

export type SeatQuotaSource = "subscription" | "platform" | "none"

export interface SeatQuota {
  quota: number
  source: SeatQuotaSource
}

export async function seatQuotaFor(
  prisma: OrganizationPrisma,
  organizationId: string
): Promise<SeatQuota> {
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    return { quota: getBillingMode().adminSeats, source: "platform" }
  }

  const [subscription, keptLaunchSeat] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        status: { in: PAYING_SUBSCRIPTION_STATUSES },
        NOT: KEPT_LAUNCH_SEAT,
      },
      orderBy: { updatedAt: "desc" },
      select: { quantity: true },
    }),
    prisma.subscription.findFirst({
      where: KEPT_LAUNCH_SEAT,
      select: { quantity: true },
    }),
  ])

  if (!(subscription || keptLaunchSeat)) {
    return { quota: 0, source: "none" }
  }

  return {
    quota: (subscription?.quantity ?? 0) + (keptLaunchSeat?.quantity ?? 0),
    source: "subscription",
  }
}

async function keptLaunchSeatsOf(
  organizationIds: string[]
): Promise<Map<string, number>> {
  const kept = new Map<string, number>()

  for (const batch of inBatches(organizationIds)) {
    const rows = await getPrisma().subscription.findMany({
      where: { ...KEPT_LAUNCH_SEAT, organizationId: { in: batch } },
      select: { organizationId: true, quantity: true },
    })

    for (const row of rows) {
      kept.set(row.organizationId, row.quantity)
    }
  }

  return kept
}

export function countSeatedServers(
  prisma: OrganizationPrisma
): Promise<number> {
  return prisma.server.count({ where: { status: { in: SEATED_STATUSES } } })
}

export interface SeatUsagePage {
  after: string | null
  take: number
}

function billedSubscriptions(page?: SeatUsagePage) {
  return getPrisma().subscription.findMany({
    where: {
      status: { in: PAYING_SUBSCRIPTION_STATUSES },
      product: { notIn: [...PLATFORM_PRODUCTS] },
      ...(page?.after ? { id: { gt: page.after } } : {}),
    },
    orderBy: { id: "asc" },
    take: page?.take,
    include: { organization: { select: { id: true, name: true, slug: true } } },
  })
}

export interface SeatUsage {
  subscription: Awaited<ReturnType<typeof billedSubscriptions>>[number]
  /** Excludes the seat kept from the launch, which is never billed. */
  seated: number
}

async function seatedServersOf(
  organizationIds: string[]
): Promise<Map<string, number>> {
  const seated = new Map<string, number>()

  for (const batch of inBatches(organizationIds)) {
    const rows = await getPrisma().server.groupBy({
      by: ["organizationId"],
      where: {
        status: { in: SEATED_STATUSES },
        organizationId: { in: batch },
      },
      _count: { _all: true },
    })

    for (const row of rows) {
      seated.set(row.organizationId, row._count._all)
    }
  }

  return seated
}

export async function readSeatUsage(
  page?: SeatUsagePage
): Promise<SeatUsage[]> {
  const subscriptions = await billedSubscriptions(page)

  if (subscriptions.length === 0) {
    return []
  }

  const organizationIds = [
    ...new Set(
      subscriptions.map((subscription) => subscription.organizationId)
    ),
  ]

  const [seated, kept] = await Promise.all([
    seatedServersOf(organizationIds),
    keptLaunchSeatsOf(organizationIds),
  ])

  return subscriptions.map((subscription) => {
    const { organizationId } = subscription
    const billable =
      (seated.get(organizationId) ?? 0) - (kept.get(organizationId) ?? 0)

    return { subscription, seated: Math.max(0, billable) }
  })
}

export async function payingSubscriptionOf(organizationId: string) {
  const subscription = await liveSubscriptionOf(organizationId)

  return subscription &&
    PAYING_SUBSCRIPTION_STATUSES.includes(subscription.status)
    ? subscription
    : null
}

export class NoPayingSubscriptionError extends Error {
  constructor() {
    super("this organization has no subscription to resize")
    this.name = "NoPayingSubscriptionError"
  }
}

export class SeatsLockedError extends Error {
  constructor() {
    super("seats do not change while trialing or on a platform product")
    this.name = "SeatsLockedError"
  }
}

export class SeatsBelowUsageError extends Error {
  readonly used: number

  constructor(used: number) {
    super(`this organization already seats ${used} servers`)
    this.name = "SeatsBelowUsageError"
    this.used = used
  }
}

export interface SeatsActor {
  organizationId: string
  userId: string
}

/** The seat kept from the launch covers one server on top of the quantity asked for. */
export async function assertSeatsCoverUsage(
  organizationId: string,
  quantity: number
): Promise<void> {
  const [seated, kept] = await Promise.all([
    getPrisma().server.count({
      where: { organizationId, status: { in: SEATED_STATUSES } },
    }),
    keptLaunchSeatsOf([organizationId]),
  ])

  const billable = seated - (kept.get(organizationId) ?? 0)

  if (quantity < billable) {
    throw new SeatsBelowUsageError(billable)
  }
}

export async function resizeSeats(
  actor: SeatsActor,
  quantity: number
): Promise<SubscriptionView | null> {
  const { organizationId } = actor
  const subscription =
    (await billedSubscriptionOf(organizationId)) ??
    (await payingSubscriptionOf(organizationId))

  if (!subscription) {
    throw new NoPayingSubscriptionError()
  }

  if (
    subscription.status === "trialing" ||
    isPlatformProduct(subscription.product)
  ) {
    throw new SeatsLockedError()
  }

  const prisma = getPrisma()

  await assertSeatsCoverUsage(organizationId, quantity)

  if (quantity === subscription.quantity) {
    return await readSubscription(organizationId)
  }

  const remote = await getBillingProvider().updateQuantity(
    subscription.stripeSubscriptionId,
    quantity
  )

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { quantity: remote.quantity },
  })

  await recordEvent({
    action: "subscription.updated",
    actorUserId: actor.userId,
    organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: { quantity: remote.quantity, previous: subscription.quantity },
  })

  return await readSubscription(organizationId)
}
