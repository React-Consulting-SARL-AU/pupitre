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

/** The seat an organization kept for good from the free launch: never billed, on top of whatever it pays. */
export const KEPT_LAUNCH_SEAT = {
  product: LAUNCH_PRODUCT,
  status: "active",
  currentPeriodEnd: null,
} as const

/** The same choice as `liveSubscriptionOf`, over rows already sorted by last touch. */
export function liveAmong<T extends { status: string }>(
  sortedByLastTouch: T[]
): T | null {
  return (
    sortedByLastTouch.find((subscription) =>
      LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
    ) ??
    sortedByLastTouch[0] ??
    null
  )
}

/**
 * The subscription that counts for an organization: the one Stripe still
 * bills, before any other. An old subscription keeps receiving events after a
 * new one opened, and the last one touched is not the one that pays.
 */
export async function liveSubscriptionOf(
  organizationId: string
): Promise<Subscription | null> {
  const prisma = getPrisma()
  const live = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
    orderBy: { updatedAt: "desc" },
  })

  return (
    live ??
    (await prisma.subscription.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    }))
  )
}

/** The live subscription Stripe bills, leaving aside what the platform granted itself. */
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
