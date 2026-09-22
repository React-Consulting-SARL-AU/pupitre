import type { Prisma } from "@pupitre/db/cloudflare/client"

export const METRICS_WINDOW_MS = 604_800_000

/**
 * What a detail answer carries, whatever the window holds: the chart draws a
 * sparkline, and three hundred and sixty points of it cover seven days as
 * well as the twenty-eight hundred the agent sends.
 */
export const CHART_MAX_POINTS = 360

export interface MetricSample {
  at: string
  disk: number
  ram: number
  load: number
  sessions: string[]
  stack_version: string | null
  modules: string[]
  /**
   * What the machine measured, beside the percentages derived from it. Null for
   * a sample an older agent sent: the console shows the percentage alone rather
   * than a machine with no disk.
   */
  disk_total_gb: number | null
  disk_free_gb: number | null
  ram_total_mb: number | null
  ram_used_mb: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

/** A quantity the sample carried, or null: zero is a measurement, absence is not. */
function toQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** A sample read back from a row, or null when the row holds nothing usable. */
export function toSample(value: unknown): MetricSample | null {
  if (!isRecord(value) || typeof value.at !== "string") {
    return null
  }

  const at = Date.parse(value.at)

  if (Number.isNaN(at)) {
    return null
  }

  return {
    at: value.at,
    disk: typeof value.disk === "number" ? value.disk : 0,
    ram: typeof value.ram === "number" ? value.ram : 0,
    load: typeof value.load === "number" ? value.load : 0,
    sessions: toStringArray(value.sessions),
    stack_version:
      typeof value.stack_version === "string" ? value.stack_version : null,
    modules: toStringArray(value.modules),
    disk_total_gb: toQuantity(value.disk_total_gb),
    disk_free_gb: toQuantity(value.disk_free_gb),
    ram_total_mb: toQuantity(value.ram_total_mb),
    ram_used_mb: toQuantity(value.ram_used_mb),
  }
}

/** The last sample without its lists: what a list of servers shows, kept beside the window. */
export interface ServerUsage {
  at: string
  disk: number
  ram: number
  load: number
  disk_total_gb: number | null
  disk_free_gb: number | null
  ram_total_mb: number | null
  ram_used_mb: number | null
}

export function toUsage(sample: MetricSample): ServerUsage {
  return {
    at: sample.at,
    disk: sample.disk,
    ram: sample.ram,
    load: sample.load,
    disk_total_gb: sample.disk_total_gb,
    disk_free_gb: sample.disk_free_gb,
    ram_total_mb: sample.ram_total_mb,
    ram_used_mb: sample.ram_used_mb,
  }
}

export function readUsage(lastUsage: unknown): ServerUsage | null {
  const sample = toSample(lastUsage)

  return sample ? toUsage(sample) : null
}

export function toStoredUsage(usage: ServerUsage): Prisma.InputJsonValue {
  return usage as unknown as Prisma.InputJsonValue
}

export function toStoredSample(sample: MetricSample): Prisma.InputJsonValue {
  return sample as unknown as Prisma.InputJsonValue
}

/**
 * The window's points reduced to what a chart shows, keeping the first and the
 * last: an even stride across the middle, so the newest reading is always the
 * one the answer ends on.
 */
export function decimateSamples(
  samples: MetricSample[],
  maxPoints = CHART_MAX_POINTS
): MetricSample[] {
  if (samples.length <= maxPoints) {
    return samples
  }

  const stride = (samples.length - 1) / (maxPoints - 1)

  return Array.from(
    { length: maxPoints },
    (_, index) => samples[Math.round(index * stride)]
  )
}
