import type {
  BillingInterval,
  Subscription,
} from "@pupitre/db/cloudflare/client"
import {
  LAUNCH_PRODUCT,
  LIVE_SUBSCRIPTION_STATUSES,
  PLATFORM_PRODUCTS,
} from "@pupitre/shared/plans"
import { getPrisma } from "../api/prisma"

/** Kept for good from the free launch: never billed, on top of whatever the organization pays. */
export const KEPT_LAUNCH_SEAT = {
  product: LAUNCH_PRODUCT,
  status: "active",
  currentPeriodEnd: null,
} as const

export interface LiveCandidate {
  status: string
  product: string
  currentPeriodEnd: Date | null
}

export function isKeptLaunchSeat({
  product,
  status,
  currentPeriodEnd,
}: LiveCandidate): boolean {
  return (
    product === KEPT_LAUNCH_SEAT.product &&
    status === KEPT_LAUNCH_SEAT.status &&
    currentPeriodEnd === KEPT_LAUNCH_SEAT.currentPeriodEnd
  )
}

export function liveAmong<T extends LiveCandidate>(
  sortedByLastTouch: T[]
): T | null {
  const live = sortedByLastTouch.filter((subscription) =>
    LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
  )

  return (
    live.find((subscription) => !isKeptLaunchSeat(subscription)) ??
    live[0] ??
    sortedByLastTouch[0] ??
    null
  )
}

// An old subscription keeps receiving events after a new one opened, so the last one touched is not the one that pays.
export async function liveSubscriptionOf(
  organizationId: string
): Promise<Subscription | null> {
  const prisma = getPrisma()
  const live = { organizationId, status: { in: LIVE_SUBSCRIPTION_STATUSES } }
  const lastTouchedFirst = { updatedAt: "desc" } as const

  return (
    (await prisma.subscription.findFirst({
      where: { ...live, NOT: KEPT_LAUNCH_SEAT },
      orderBy: lastTouchedFirst,
    })) ??
    (await prisma.subscription.findFirst({
      where: live,
      orderBy: lastTouchedFirst,
    })) ??
    (await prisma.subscription.findFirst({
      where: { organizationId },
      orderBy: lastTouchedFirst,
    }))
  )
}

export function billedSubscriptionOf(
  organizationId: string
): Promise<Subscription | null> {
  return getPrisma().subscription.findFirst({
    where: {
      organizationId,
      status: { in: LIVE_SUBSCRIPTION_STATUSES },
      product: { notIn: [...PLATFORM_PRODUCTS] },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export interface SubscriptionView {
  id: string
  stripe_subscription_id: string
  product: string
  quantity: number
  status: string
  interval: BillingInterval | null
  current_period_end: Date | null
  created_at: Date
  updated_at: Date
}

export async function readSubscription(
  organizationId: string
): Promise<SubscriptionView | null> {
  const [subscription, billing] = await Promise.all([
    liveSubscriptionOf(organizationId),
    getPrisma().organizationBilling.findUnique({ where: { organizationId } }),
  ])

  if (!subscription) {
    return null
  }

  return {
    id: subscription.id,
    stripe_subscription_id: subscription.stripeSubscriptionId,
    product: subscription.product,
    quantity: subscription.quantity,
    status: subscription.status,
    interval: billing?.defaultInterval ?? null,
    current_period_end: subscription.currentPeriodEnd,
    created_at: subscription.createdAt,
    updated_at: subscription.updatedAt,
  }
}

export function readBilling(organizationId: string) {
  return getPrisma().organizationBilling.findUnique({
    where: { organizationId },
  })
}
