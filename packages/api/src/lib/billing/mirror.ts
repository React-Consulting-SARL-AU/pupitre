import { getPrisma } from "../api/prisma"
import type { AuditAction } from "../audit/audit"
import { graceDeadline, subscriptionStateOf } from "./entitlement"
import { graceOrganizationServers, restoreOrganizationServers } from "./grace"
import type { RemoteSubscription } from "./provider"
import { liveSubscriptionOf } from "./subscription"

export async function mirrorSubscription(
  organizationId: string,
  remote: RemoteSubscription
): Promise<AuditAction> {
  const prisma = getPrisma()
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: remote.id },
    select: { id: true },
  })
  const data = {
    product: remote.product,
    quantity: remote.quantity,
    status: remote.status,
    currentPeriodEnd: remote.current_period_end,
    cancelAtPeriodEnd: remote.cancel_at_period_end,
  }

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: remote.id },
    create: { organizationId, stripeSubscriptionId: remote.id, ...data },
    update: data,
  })

  return existing ? "subscription.updated" : "subscription.created"
}

/**
 * The servers follow the one subscription that counts, read back from the
 * mirror after every event: a live one restores them, an unpaid one opens the
 * seven-day tolerance, a cancelled one lets them run to the end of the period.
 * The event that arrives last is not always the one that happened last.
 */
export async function applyOrganizationEntitlement(
  organizationId: string,
  now: Date
): Promise<void> {
  const subscription = await liveSubscriptionOf(organizationId)

  if (!subscription) {
    return
  }

  const state = subscriptionStateOf(subscription.status)

  if (state === "valid") {
    await restoreOrganizationServers(organizationId, now)

    return
  }

  if (state === "grace") {
    await graceOrganizationServers(organizationId, graceDeadline(now))

    return
  }

  if (subscription.status === "canceled") {
    await graceOrganizationServers(
      organizationId,
      subscription.currentPeriodEnd ?? graceDeadline(now)
    )
  }
}
