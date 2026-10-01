import { getPrisma } from "../api/prisma"
import type { AuditAction } from "../audit/audit"
import {
  graceOrganizationServers,
  restoreOrganizationServers,
  settleUnlicensedOrganization,
} from "./grace"
import { graceDeadline, subscriptionStateOf } from "./license"
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

/** Reads the mirror back: the event that arrives last is not always the one that happened last. */
export async function applyOrganizationLicense(
  organizationId: string,
  now: Date
): Promise<void> {
  const subscription = await liveSubscriptionOf(organizationId)
  const state = subscription
    ? subscriptionStateOf(subscription.status)
    : "suspended"

  if (state === "valid") {
    await restoreOrganizationServers(organizationId, now)

    return
  }

  if (state === "grace") {
    await graceOrganizationServers(organizationId, graceDeadline(now))

    return
  }

  await settleUnlicensedOrganization(organizationId, now)
}
