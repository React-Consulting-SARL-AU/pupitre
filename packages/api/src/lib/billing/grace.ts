import { getPrisma } from "../api/prisma"
import { entitlementWindow } from "./entitlement"

const GRACEABLE_STATUSES = ["active", "grace"] as const

export function graceOrganizationServers(
  organizationId: string,
  validUntil: Date
): Promise<number> {
  return getPrisma()
    .server.updateMany({
      where: { organizationId, status: { in: [...GRACEABLE_STATUSES] } },
      data: { status: "grace", entitlementValidUntil: validUntil },
    })
    .then((result) => result.count)
}

export function restoreOrganizationServers(
  organizationId: string,
  now: Date = new Date()
): Promise<number> {
  return getPrisma()
    .server.updateMany({
      where: { organizationId, status: "grace" },
      data: { status: "active", entitlementValidUntil: entitlementWindow(now) },
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
    select: { id: true },
  })

  if (expired.length === 0) {
    return []
  }

  const ids = expired.map((server) => server.id)

  await prisma.server.updateMany({
    where: { id: { in: ids } },
    data: { status: "suspended" },
  })

  return ids
}
