import { z } from "zod"

export const STATUS_FRESHNESS = ["fresh", "stale", "unknown"] as const

const StatusFreshnessSchema = z.enum(STATUS_FRESHNESS)

export type StatusFreshness = z.infer<typeof StatusFreshnessSchema>

// Three heartbeat cycles: one missed beat is unremarkable, three across the fleet means collection is broken.
export const STATUS_STALE_AFTER_MS = 900_000

export const STATUS_STALE_AFTER_MINUTES = STATUS_STALE_AFTER_MS / 60_000

export function statusFreshness(
  lastObservationAt: Date | string | null,
  now: Date = new Date()
): StatusFreshness {
  if (!lastObservationAt) {
    return "unknown"
  }

  const observed = new Date(lastObservationAt).getTime()

  if (Number.isNaN(observed)) {
    return "unknown"
  }

  return now.getTime() - observed > STATUS_STALE_AFTER_MS ? "stale" : "fresh"
}
