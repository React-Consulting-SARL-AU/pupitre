import type { Prisma } from "@pupitre/db/cloudflare/client"

export const METRICS_WINDOW_MS = 604_800_000

const MAX_SAMPLES = 2016

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

function toSample(value: unknown): MetricSample | null {
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

export function readSamples(metrics: unknown): MetricSample[] {
  const samples = isRecord(metrics) ? metrics.samples : null

  if (!Array.isArray(samples)) {
    return []
  }

  return samples.flatMap((entry) => {
    const sample = toSample(entry)

    return sample ? [sample] : []
  })
}

export function appendSample(
  metrics: unknown,
  sample: MetricSample,
  now: Date
): MetricSample[] {
  const floor = now.getTime() - METRICS_WINDOW_MS
  const kept = readSamples(metrics).filter(
    (entry) => Date.parse(entry.at) >= floor
  )

  return [...kept, sample].slice(-MAX_SAMPLES)
}

export function toStoredMetrics(
  samples: MetricSample[]
): Prisma.InputJsonValue {
  return { samples } as unknown as Prisma.InputJsonValue
}
