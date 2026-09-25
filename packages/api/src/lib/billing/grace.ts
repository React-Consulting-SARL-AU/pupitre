import {
  sendEntitlementGraceEmail,
  sendServerSuspendedEmail,
} from "../../emails/notifications"
import { D1_BATCH_SIZE, drainBatches } from "../api/batches"
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

export const SUSPENSION_BATCH_SIZE = D1_BATCH_SIZE

export interface SuspendedServer {
  id: string
  organizationId: string
}

export interface SuspensionNotice {
  organizationId: string
  serverCount: number
}

/** One statement suspends a batch of servers whose tolerance has run out, and says which. */
export function suspendExpiredGraceBatch(
  now: Date = new Date()
): Promise<SuspendedServer[]> {
  return getPrisma().server.updateManyAndReturn({
    where: { status: "grace", entitlementValidUntil: { lte: now } },
    data: { status: "suspended", suspendedReason: "billing" },
    limit: SUSPENSION_BATCH_SIZE,
    select: { id: true, organizationId: true },
  })
}

export function suspensionNotices(
  suspended: SuspendedServer[]
): SuspensionNotice[] {
  const counts = new Map<string, number>()

  for (const server of suspended) {
    counts.set(
      server.organizationId,
      (counts.get(server.organizationId) ?? 0) + 1
    )
  }

  return [...counts].map(([organizationId, serverCount]) => ({
    organizationId,
    serverCount,
  }))
}

export function announceSuspension(notice: SuspensionNotice): Promise<void> {
  return sendServerSuspendedEmail(notice)
}

export async function suspendExpiredGrace(
  now: Date = new Date()
): Promise<string[]> {
  const suspended = await drainBatches(SUSPENSION_BATCH_SIZE, () =>
    suspendExpiredGraceBatch(now)
  )

  for (const notice of suspensionNotices(suspended)) {
    await announceSuspension(notice)
  }

  return suspended.map((server) => server.id)
}
