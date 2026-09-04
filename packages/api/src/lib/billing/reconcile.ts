import { getPrisma } from "../api/prisma"
import { getBillingProvider } from "./runtime"
import { PAYING_SUBSCRIPTION_STATUSES, SEATED_STATUSES } from "./seats"

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

export async function reconcileSeats({
  apply = false,
}: ReconcileSeatsOptions = {}): Promise<SeatReconciliation[]> {
  const prisma = getPrisma()
  const subscriptions = await prisma.subscription.findMany({
    where: { status: { in: PAYING_SUBSCRIPTION_STATUSES } },
    orderBy: { createdAt: "asc" },
  })

  if (subscriptions.length === 0) {
    return []
  }

  const seats = await prisma.server.groupBy({
    by: ["organizationId"],
    where: {
      status: { in: SEATED_STATUSES },
      organizationId: {
        in: subscriptions.map((subscription) => subscription.organizationId),
      },
    },
    _count: { _all: true },
  })
  const seatedByOrganization = new Map(
    seats.map((row) => [row.organizationId, row._count._all])
  )
  const report: SeatReconciliation[] = []

  for (const subscription of subscriptions) {
    const seated = seatedByOrganization.get(subscription.organizationId) ?? 0
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
