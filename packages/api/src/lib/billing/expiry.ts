import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { graceOrganizationServers } from "./grace"
import { liveSubscriptionOf } from "./subscription"

export interface EndedSubscriptionsFilter {
  product: string
  status: string
}

/**
 * Every row of this product and status whose end has passed is cancelled, and
 * its servers take that past date so the suspension that runs next closes
 * them the same day — unless another subscription is the one that counts for
 * the organization, which has already paid for those servers.
 */
export async function cancelEndedSubscriptions(
  filter: EndedSubscriptionsFilter,
  now: Date
): Promise<string[]> {
  const prisma = getPrisma()
  const ended = await prisma.subscription.findMany({
    where: { ...filter, currentPeriodEnd: { lte: now } },
    orderBy: { currentPeriodEnd: "asc" },
  })

  for (const subscription of ended) {
    const live = await liveSubscriptionOf(subscription.organizationId)

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "canceled" },
    })
    await recordEvent({
      action: "subscription.canceled",
      actorUserId: null,
      organizationId: subscription.organizationId,
      targetType: "subscription",
      targetId: subscription.stripeSubscriptionId,
      payload: {
        status: "canceled",
        quantity: subscription.quantity,
        product: subscription.product,
        current_period_end:
          subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    })

    if (!live || live.id === subscription.id) {
      await graceOrganizationServers(
        subscription.organizationId,
        subscription.currentPeriodEnd ?? now
      )
    }
  }

  return ended.map((subscription) => subscription.id)
}
