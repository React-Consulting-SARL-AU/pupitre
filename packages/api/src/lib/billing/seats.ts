import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import { getPrisma, type OrganizationPrisma } from "../api/prisma"

export const SEATED_STATUSES: ServerStatus[] = [
  "enrolling",
  "active",
  "grace",
  "suspended",
]

export const PAYING_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"]

export type SeatQuotaSource = "subscription" | "none"

export interface SeatQuota {
  quota: number
  source: SeatQuotaSource
}

export async function seatQuotaFor(
  prisma: OrganizationPrisma
): Promise<SeatQuota> {
  const subscription = await prisma.subscription.findFirst({
    where: { status: { in: PAYING_SUBSCRIPTION_STATUSES } },
    orderBy: { updatedAt: "desc" },
    select: { quantity: true },
  })

  if (!subscription) {
    return { quota: 0, source: "none" }
  }

  return { quota: subscription.quantity, source: "subscription" }
}

export function countSeatedServers(
  prisma: OrganizationPrisma
): Promise<number> {
  return prisma.server.count({ where: { status: { in: SEATED_STATUSES } } })
}

export async function payingSubscriptionOf(organizationId: string) {
  return await getPrisma().subscription.findFirst({
    where: {
      organizationId,
      status: { in: PAYING_SUBSCRIPTION_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
  })
}
