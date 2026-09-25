import { sendSeatsDriftEmail } from "../../emails/notifications"
import { type CursorBatch, D1_BATCH_SIZE, walkBatches } from "../api/batches"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { getBillingProvider } from "./runtime"
import { readSeatUsage } from "./seats"

export const SEAT_RECONCILIATION_BATCH_SIZE = D1_BATCH_SIZE

export interface SeatReconciliation {
  organization_id: string
  stripe_subscription_id: string
  status: string
  paid: number
  seated: number
  drift: number
  applied: boolean
}

export interface ReconcileSeatsOptions {
  apply?: boolean
}

export interface SeatReconciliationBatch extends CursorBatch {
  report: SeatReconciliation[]
}

interface DriftingSubscription {
  organizationId: string
  stripeSubscriptionId: string
  quantity: number
}

interface DriftPayload {
  paid?: unknown
  seated?: unknown
}

async function alreadyAnnounced(
  subscription: DriftingSubscription,
  seated: number
): Promise<boolean> {
  const last = await getPrisma().event.findFirst({
    where: {
      action: "seats.drifted",
      targetType: "subscription",
      targetId: subscription.stripeSubscriptionId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { payload: true },
  })
  const payload = last?.payload as DriftPayload | null | undefined

  return payload?.paid === subscription.quantity && payload.seated === seated
}

/** More servers seated than seats paid: the journal keeps it, the owner hears it, once per new count. */
async function announceDrift(
  subscription: DriftingSubscription,
  seated: number
): Promise<void> {
  if (await alreadyAnnounced(subscription, seated)) {
    return
  }

  await recordEvent({
    action: "seats.drifted",
    actorUserId: null,
    organizationId: subscription.organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      paid: subscription.quantity,
      seated,
      drift: seated - subscription.quantity,
    },
  })
  await sendSeatsDriftEmail({
    organizationId: subscription.organizationId,
    paid: subscription.quantity,
    seated,
  })
}

export async function reconcileSeatsBatch(
  after: string | null,
  { apply = false }: ReconcileSeatsOptions = {}
): Promise<SeatReconciliationBatch> {
  const prisma = getPrisma()
  const usage = await readSeatUsage({
    after,
    take: SEAT_RECONCILIATION_BATCH_SIZE,
  })
  const report: SeatReconciliation[] = []

  for (const { subscription, seated } of usage) {
    const drift = seated - subscription.quantity
    let applied = false

    if (apply && drift !== 0) {
      await getBillingProvider().updateQuantity(
        subscription.stripeSubscriptionId,
        seated
      )
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { quantity: seated },
      })

      applied = true
    }

    if (drift > 0) {
      await announceDrift(subscription, seated)
    }

    report.push({
      organization_id: subscription.organizationId,
      stripe_subscription_id: subscription.stripeSubscriptionId,
      status: subscription.status,
      paid: subscription.quantity,
      seated,
      drift,
      applied,
    })
  }

  const next =
    usage.length < SEAT_RECONCILIATION_BATCH_SIZE
      ? null
      : (usage.at(-1)?.subscription.id ?? null)

  return { report, next }
}

export async function reconcileSeats(
  options: ReconcileSeatsOptions = {}
): Promise<SeatReconciliation[]> {
  const batches = await walkBatches((after) =>
    reconcileSeatsBatch(after, options)
  )

  return batches.flatMap((batch) => batch.report)
}
