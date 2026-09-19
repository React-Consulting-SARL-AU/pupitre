import { sendSeatsDriftEmail } from "../../emails/notifications"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { getBillingProvider } from "./runtime"
import { readSeatUsage } from "./seats"

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

interface DriftingSubscription {
  organizationId: string
  stripeSubscriptionId: string
  quantity: number
}

/** More servers seated than seats paid: the journal keeps it, the owner hears it. */
async function announceDrift(
  subscription: DriftingSubscription,
  seated: number
): Promise<void> {
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

export async function reconcileSeats({
  apply = false,
}: ReconcileSeatsOptions = {}): Promise<SeatReconciliation[]> {
  const prisma = getPrisma()
  const usage = await readSeatUsage()
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

  return report
}
