import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import {
  FREE_SERVERS,
  isPlatformProduct,
  LIVE_SUBSCRIPTION_STATUSES,
  PLATFORM_ORGANIZATION_SEATS,
  PLATFORM_PRODUCTS,
} from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { inBatches } from "../api/batches"
import { getPrisma, type OrganizationPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { assertBillingOn, getBillingProvider } from "./runtime"
import {
  billedSubscriptionOf,
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

export async function seatQuotaFor(
  prisma: OrganizationPrisma,
  organizationId: string
): Promise<number> {
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    return PLATFORM_ORGANIZATION_SEATS
  }

  const license = await prisma.subscription.findFirst({
    where: { status: { in: PAYING_SUBSCRIPTION_STATUSES } },
    orderBy: { updatedAt: "desc" },
    select: { quantity: true },
  })

  return FREE_SERVERS + (license?.quantity ?? 0)
}

export function countSeatedServers(
  prisma: OrganizationPrisma
): Promise<number> {
  return prisma.server.count({ where: { status: { in: SEATED_STATUSES } } })
}

// The free servers are never billed: a licence pays for the seats beyond them.
export function licensedSeatsFor(seated: number): number {
  return Math.max(0, seated - FREE_SERVERS)
}

export interface SeatUsagePage {
  after: string | null
  take: number
}

const BILLED_PRODUCTS = { product: { notIn: [...PLATFORM_PRODUCTS] } }

// The platform organisation's quota never comes from a licence.
const LICENSED_ORGANIZATIONS = {
  organizationId: { not: PLATFORM_ORGANIZATION_ID },
}

function liveSubscriptions(
  scope: typeof BILLED_PRODUCTS | typeof LICENSED_ORGANIZATIONS,
  page?: SeatUsagePage
) {
  return getPrisma().subscription.findMany({
    where: {
      status: { in: PAYING_SUBSCRIPTION_STATUSES },
      ...scope,
      ...(page?.after ? { id: { gt: page.after } } : {}),
    },
    orderBy: { id: "asc" },
    take: page?.take,
    include: { organization: { select: { id: true, name: true, slug: true } } },
  })
}

export interface SeatUsage {
  subscription: Awaited<ReturnType<typeof liveSubscriptions>>[number]
  /** Excludes the free servers, which are never billed. */
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

async function usageOf(
  subscriptions: SeatUsage["subscription"][]
): Promise<SeatUsage[]> {
  if (subscriptions.length === 0) {
    return []
  }

  const seated = await seatedServersOf([
    ...new Set(
      subscriptions.map((subscription) => subscription.organizationId)
    ),
  ])

  return subscriptions.map((subscription) => ({
    subscription,
    seated: licensedSeatsFor(seated.get(subscription.organizationId) ?? 0),
  }))
}

// Only Stripe rows: the seats Stripe is told about.
export async function readSeatUsage(
  page?: SeatUsagePage
): Promise<SeatUsage[]> {
  return await usageOf(await liveSubscriptions(BILLED_PRODUCTS, page))
}

// Granted licences included: their seats never follow usage on their own.
export async function readLicenseUsage(): Promise<SeatUsage[]> {
  return await usageOf(await liveSubscriptions(LICENSED_ORGANIZATIONS))
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
    super("this organization has no licence to resize")
    this.name = "NoPayingSubscriptionError"
  }
}

export class SeatsLockedError extends Error {
  constructor() {
    super("seats do not change on a platform product")
    this.name = "SeatsLockedError"
  }
}

export class SeatsBelowUsageError extends Error {
  readonly used: number

  constructor(used: number) {
    super(`this organization already seats ${used} servers past the free ones`)
    this.name = "SeatsBelowUsageError"
    this.used = used
  }
}

export interface SeatsActor {
  organizationId: string
  userId: string
}

export async function assertSeatsCoverUsage(
  organizationId: string,
  quantity: number
): Promise<void> {
  const seated = await getPrisma().server.count({
    where: { organizationId, status: { in: SEATED_STATUSES } },
  })
  const licensed = licensedSeatsFor(seated)

  if (quantity < licensed) {
    throw new SeatsBelowUsageError(licensed)
  }
}

export async function resizeSeats(
  actor: SeatsActor,
  quantity: number
): Promise<SubscriptionView | null> {
  assertBillingOn()

  const { organizationId } = actor
  const subscription =
    (await billedSubscriptionOf(organizationId)) ??
    (await payingSubscriptionOf(organizationId))

  if (!subscription) {
    throw new NoPayingSubscriptionError()
  }

  if (isPlatformProduct(subscription.product)) {
    throw new SeatsLockedError()
  }

  await assertSeatsCoverUsage(organizationId, quantity)

  if (quantity === subscription.quantity) {
    return await readSubscription(organizationId)
  }

  const remote = await getBillingProvider().updateQuantity(
    subscription.stripeSubscriptionId,
    quantity
  )

  await getPrisma().subscription.update({
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
