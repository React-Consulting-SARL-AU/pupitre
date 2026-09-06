import { getPrisma } from "../api/prisma"
import { RELEASED_ENROLLMENT } from "./enrollment-key"

export const DECOMMISSION_DELAY_MS = 604_800_000

export function decommissionDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + DECOMMISSION_DELAY_MS)
}

export async function expireEnrollments(
  now: Date = new Date()
): Promise<string[]> {
  const prisma = getPrisma()
  const pending = await prisma.server.findMany({
    where: {
      status: "enrolling",
      serverTokenHash: null,
      enrollmentExpiresAt: { lt: now },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  if (pending.length === 0) {
    return []
  }

  const ids = pending.map((server) => server.id)

  await prisma.server.updateMany({
    where: { id: { in: ids } },
    data: {
      ...RELEASED_ENROLLMENT,
      status: "revoked",
      decommissionAt: decommissionDeadline(now),
    },
  })

  return ids
}

export async function decommissionDueServers(
  now: Date = new Date()
): Promise<string[]> {
  const prisma = getPrisma()
  const due = await prisma.server.findMany({
    where: { decommissionAt: { lte: now } },
    orderBy: { decommissionAt: "asc" },
    select: { id: true },
  })

  if (due.length === 0) {
    return []
  }

  const ids = due.map((server) => server.id)

  await prisma.server.deleteMany({ where: { id: { in: ids } } })

  return ids
}
