import {
  sendEntitlementGraceEmail,
  sendServerSuspendedEmail,
} from "../../emails/notifications"
import { getPrisma } from "../api/prisma"
import { entitlementWindow } from "./entitlement"

/**
 * Only a server still in full use takes the deadline: one already in
 * tolerance keeps the day it was given, whatever Stripe retries in between.
 */
export async function graceOrganizationServers(
  organizationId: string,
  validUntil: Date
): Promise<number> {
  const { count } = await getPrisma().server.updateMany({
    where: { organizationId, status: "active" },
    data: { status: "grace", entitlementValidUntil: validUntil },
  })

  if (count > 0) {
    await sendEntitlementGraceEmail({
      organizationId,
      deadline: validUntil,
      serverCount: count,
    })
  }

  return count
}

export function restoreOrganizationServers(
  organizationId: string,
  now: Date = new Date()
): Promise<number> {
  return getPrisma()
    .server.updateMany({
      where: {
        organizationId,
        OR: [
          { status: "grace" },
          { status: "suspended", suspendedReason: "billing" },
        ],
      },
      data: {
        status: "active",
        suspendedReason: null,
        entitlementValidUntil: entitlementWindow(now),
      },
    })
    .then((result) => result.count)
}

export async function suspendExpiredGrace(
  now: Date = new Date()
): Promise<string[]> {
  const prisma = getPrisma()
  const expired = await prisma.server.findMany({
    where: {
      status: "grace",
      entitlementValidUntil: { lte: now },
    },
    orderBy: { entitlementValidUntil: "asc" },
    select: { id: true, organizationId: true },
  })

  if (expired.length === 0) {
    return []
  }

  const ids = expired.map((server) => server.id)

  await prisma.server.updateMany({
    where: { id: { in: ids } },
    data: { status: "suspended", suspendedReason: "billing" },
  })

  await announceSuspensions(expired)

  return ids
}

async function announceSuspensions(
  suspended: { organizationId: string }[]
): Promise<void> {
  const counts = new Map<string, number>()

  for (const server of suspended) {
    counts.set(
      server.organizationId,
      (counts.get(server.organizationId) ?? 0) + 1
    )
  }

  for (const [organizationId, serverCount] of counts) {
    await sendServerSuspendedEmail({ organizationId, serverCount })
  }
}
