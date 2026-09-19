import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import { isPlatformProduct } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma, type OrganizationPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { getBillingMode, getBillingProvider } from "./runtime"
import {
  LIVE_SUBSCRIPTION_STATUSES,
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

/**
 * The platform's own organization holds the team's seats without any
 * subscription: nobody bills Pupitre for Pupitre.
 */
export async function seatQuotaFor(
  prisma: OrganizationPrisma,
  organizationId: string
): Promise<SeatQuota> {
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    return { quota: getBillingMode().adminSeats, source: "platform" }
  }

  const subscription = await prisma.subscription.findFirst({
    where: { status: { in: PAYING_SUBSCRIPTION_STATUSES } },
    orderBy: { updatedAt: "desc" },
    select: { quantity: true },
  })

  if (!subscription) {
    return { quota: 0, source: "none" }
  }

  return { quota: subscription.quantity, source: "subscription" }
}

export function countSeatedServers(
  prisma: OrganizationPrisma
): Promise<number> {
  return prisma.server.count({ where: { status: { in: SEATED_STATUSES } } })
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

export async function assertSeatsCoverUsage(
  organizationId: string,
  quantity: number
): Promise<void> {
  const seated = await getPrisma().server.count({
    where: { organizationId, status: { in: SEATED_STATUSES } },
  })

  if (quantity < seated) {
    throw new SeatsBelowUsageError(seated)
  }
}

export async function resizeSeats(
  actor: SeatsActor,
  quantity: number
): Promise<SubscriptionView | null> {
  const { organizationId } = actor
  const subscription = await payingSubscriptionOf(organizationId)

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
