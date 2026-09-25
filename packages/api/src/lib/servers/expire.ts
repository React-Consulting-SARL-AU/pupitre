import { D1_BATCH_SIZE, drainBatches } from "../api/batches"
import { getPrisma } from "../api/prisma"
import { RELEASED_ENROLLMENT } from "./enrollment-key"

export const DECOMMISSION_DELAY_MS = 604_800_000

export const ENROLLMENT_EXPIRY_BATCH_SIZE = D1_BATCH_SIZE

/** A server brings a week of metric samples down with it: a few per step keep each step short. */
export const DECOMMISSION_BATCH_SIZE = 5

export const METRIC_DELETE_CHUNK = 500

export function decommissionDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + DECOMMISSION_DELAY_MS)
}

export async function expireEnrollmentsBatch(
  now: Date = new Date()
): Promise<string[]> {
  const expired = await getPrisma().server.updateManyAndReturn({
    where: {
      status: "enrolling",
      serverTokenHash: null,
      enrollmentExpiresAt: { lt: now },
    },
    data: {
      ...RELEASED_ENROLLMENT,
      status: "revoked",
      assignedUserId: null,
      pendingAssignmentEmail: null,
      decommissionAt: decommissionDeadline(now),
    },
    limit: ENROLLMENT_EXPIRY_BATCH_SIZE,
    select: { id: true },
  })

  return expired.map((server) => server.id)
}

export function expireEnrollments(now: Date = new Date()): Promise<string[]> {
  return drainBatches(ENROLLMENT_EXPIRY_BATCH_SIZE, () =>
    expireEnrollmentsBatch(now)
  )
}

// Chunked first: a cascading server delete would carry thousands of rows in one statement.
async function deleteMetricsOf(serverId: string): Promise<void> {
  const prisma = getPrisma()

  for (;;) {
    const { count } = await prisma.serverMetric.deleteMany({
      where: { serverId },
      limit: METRIC_DELETE_CHUNK,
    })

    if (count < METRIC_DELETE_CHUNK) {
      return
    }
  }
}

export async function decommissionDueServersBatch(
  now: Date = new Date()
): Promise<string[]> {
  const prisma = getPrisma()
  const where = { decommissionAt: { lte: now } }

  const due = await prisma.server.findMany({
    where,
    orderBy: { decommissionAt: "asc" },
    take: DECOMMISSION_BATCH_SIZE,
    select: { id: true },
  })

  if (due.length === 0) {
    return []
  }

  const ids = due.map((server) => server.id)

  for (const id of ids) {
    await deleteMetricsOf(id)
  }

  await prisma.server.deleteMany({ where: { ...where, id: { in: ids } } })

  return ids
}

export function decommissionDueServers(
  now: Date = new Date()
): Promise<string[]> {
  return drainBatches(DECOMMISSION_BATCH_SIZE, () =>
    decommissionDueServersBatch(now)
  )
}
