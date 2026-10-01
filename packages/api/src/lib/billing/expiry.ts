import { LIVE_SUBSCRIPTION_STATUSES } from "@pupitre/shared/plans"
import { drainBatches } from "../api/batches"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { settleUnlicensedOrganization } from "./grace"

/** Each ended row costs a few writes: a batch stays well inside one workflow step. */
export const EXPIRY_BATCH_SIZE = 25

export interface EndedSubscriptionsFilter {
  product: string
  status: string
}

async function organizationsCoveredElsewhere(
  ended: { id: string; organizationId: string }[]
): Promise<Set<string>> {
  const others = await getPrisma().subscription.findMany({
    where: {
      organizationId: {
        in: [...new Set(ended.map((row) => row.organizationId))],
      },
      id: { notIn: ended.map((row) => row.id) },
      status: { in: LIVE_SUBSCRIPTION_STATUSES },
    },
    select: { organizationId: true },
  })

  return new Set(others.map((row) => row.organizationId))
}

/** Rows are cancelled last, so a retry after a failure finds them again instead of leaving servers running. */
export async function cancelEndedSubscriptionsBatch(
  filter: EndedSubscriptionsFilter,
  now: Date = new Date()
): Promise<string[]> {
  const prisma = getPrisma()
  const where = { ...filter, currentPeriodEnd: { lte: now } }
  const ended = await prisma.subscription.findMany({
    where,
    orderBy: { currentPeriodEnd: "asc" },
    take: EXPIRY_BATCH_SIZE,
  })

  if (ended.length === 0) {
    return []
  }

  const covered = await organizationsCoveredElsewhere(ended)
  const settled = new Set<string>()

  for (const subscription of ended) {
    const { organizationId } = subscription

    if (!(covered.has(organizationId) || settled.has(organizationId))) {
      settled.add(organizationId)
      await settleUnlicensedOrganization(organizationId, now)
    }

    await recordEvent({
      action: "subscription.canceled",
      actorUserId: null,
      organizationId,
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
  }

  const ids = ended.map((subscription) => subscription.id)

  await prisma.subscription.updateMany({
    where: { ...where, id: { in: ids } },
    data: { status: "canceled" },
  })

  return ids
}

export function cancelEndedSubscriptions(
  filter: EndedSubscriptionsFilter,
  now: Date = new Date()
): Promise<string[]> {
  return drainBatches(EXPIRY_BATCH_SIZE, () =>
    cancelEndedSubscriptionsBatch(filter, now)
  )
}
