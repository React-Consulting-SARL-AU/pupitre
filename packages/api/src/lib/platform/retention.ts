import { D1_BATCH_SIZE } from "../api/batches"
import { getPrisma } from "../api/prisma"
import { METRICS_WINDOW_MS } from "../servers/metrics"

// The workflow runs passes until one comes back short.
const SWEEP_PASS_BATCHES = 50

export const SWEEP_PASS_LIMIT = D1_BATCH_SIZE * SWEEP_PASS_BATCHES

async function drain(
  nextIds: () => Promise<{ id: string }[]>,
  remove: (ids: string[]) => Promise<unknown>
): Promise<number> {
  let removed = 0

  for (let batch = 0; batch < SWEEP_PASS_BATCHES; batch += 1) {
    const ids = (await nextIds()).map((row) => row.id)

    if (ids.length === 0) {
      break
    }

    await remove(ids)
    removed += ids.length

    if (ids.length < D1_BATCH_SIZE) {
      break
    }
  }

  return removed
}

// A server that stopped beating never prunes its own samples.
export function sweepServerMetrics(now: Date = new Date()): Promise<number> {
  const prisma = getPrisma()
  const cutoff = new Date(now.getTime() - METRICS_WINDOW_MS)

  return drain(
    () =>
      prisma.serverMetric.findMany({
        where: { at: { lt: cutoff } },
        take: D1_BATCH_SIZE,
        select: { id: true },
      }),
    (ids) => prisma.serverMetric.deleteMany({ where: { id: { in: ids } } })
  )
}

export function sweepExpiredSessions(now: Date = new Date()): Promise<number> {
  const prisma = getPrisma()

  return drain(
    () =>
      prisma.session.findMany({
        where: { expiresAt: { lt: now } },
        take: D1_BATCH_SIZE,
        select: { id: true },
      }),
    (ids) => prisma.session.deleteMany({ where: { id: { in: ids } } })
  )
}

export function sweepExpiredVerifications(
  now: Date = new Date()
): Promise<number> {
  const prisma = getPrisma()

  return drain(
    () =>
      prisma.verification.findMany({
        where: { expiresAt: { lt: now } },
        take: D1_BATCH_SIZE,
        select: { id: true },
      }),
    (ids) => prisma.verification.deleteMany({ where: { id: { in: ids } } })
  )
}

export function sweepExpiredDeviceCodes(
  now: Date = new Date()
): Promise<number> {
  const prisma = getPrisma()

  return drain(
    () =>
      prisma.deviceCode.findMany({
        where: { expiresAt: { lt: now } },
        take: D1_BATCH_SIZE,
        select: { id: true },
      }),
    (ids) => prisma.deviceCode.deleteMany({ where: { id: { in: ids } } })
  )
}
