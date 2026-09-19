import { productKey } from "@/lib/domain/admin"
import type { Translate } from "@/lib/i18n/i18n"

const BYTE_UNITS_FR = ["o", "ko", "Mo", "Go", "To"] as const
const BYTE_UNITS_EN = ["B", "kB", "MB", "GB", "TB"] as const

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export function formatBytes(bytes: number, t: Translate): string {
  const units = t.locale === "fr" ? BYTE_UNITS_FR : BYTE_UNITS_EN
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  const written = value.toFixed(value >= 10 || unit === 0 ? 0 : 1)

  return `${t.locale === "fr" ? written.replace(".", ",") : written} ${units[unit]}`
}

const BYTES_PER_GB = 1024 ** 3

const BYTES_PER_MB = 1024 ** 2

/**
 * What a machine holds and how much of it is taken, in the unit that suits the
 * figure — a percentage says the disk is at 94 %, this says how many gigabytes
 * are left to work with. Null for a server whose agent measured neither.
 */
export function formatUsed(
  used: number | null,
  total: number | null,
  t: Translate
): string | null {
  if (used === null || total === null || total <= 0) {
    return null
  }

  return `${formatBytes(used, t)} / ${formatBytes(total, t)}`
}

export function gigabytesToBytes(gb: number | null): number | null {
  return gb === null ? null : gb * BYTES_PER_GB
}

export function megabytesToBytes(mb: number | null): number | null {
  return mb === null ? null : mb * BYTES_PER_MB
}

export function formatRatio(ratio: number, t: Translate): string {
  const space = t.locale === "fr" ? " " : ""

  return `${Math.round(ratio * 100)}${space}%`
}

/** A day, for what ends on one: a launch, a period, never a moment. */
export function formatDate(value: string | Date, t: Translate): string {
  return new Intl.DateTimeFormat(t.locale, { dateStyle: "long" }).format(
    new Date(value)
  )
}

export function formatDateTime(value: string | Date, t: Translate): string {
  return new Intl.DateTimeFormat(t.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function formatRelative(
  value: string | Date | null,
  t: Translate,
  now: Date = new Date()
): string {
  if (!value) {
    return t("format.never")
  }

  const elapsed = now.getTime() - new Date(value).getTime()

  if (elapsed < MINUTE_MS) {
    return t("format.justNow")
  }

  if (elapsed < HOUR_MS) {
    return t("format.minutesAgo", { count: Math.floor(elapsed / MINUTE_MS) })
  }

  if (elapsed < DAY_MS) {
    return t("format.hoursAgo", { count: Math.floor(elapsed / HOUR_MS) })
  }

  return t("format.daysAgo", { count: Math.floor(elapsed / DAY_MS) })
}

/** A product Stripe invents after this was written keeps its own name on screen. */
export function formatProduct(product: string | null, t: Translate): string {
  const key = productKey(product)

  return key ? t(key) : (product ?? t("format.none"))
}
