import type { BillingInterval } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

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
  const prisma = getPrisma()
  const [subscription, billing] = await Promise.all([
    prisma.subscription.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.organizationBilling.findUnique({ where: { organizationId } }),
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
