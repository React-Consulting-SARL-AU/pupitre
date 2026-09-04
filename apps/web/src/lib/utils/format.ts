const BYTE_UNITS = ["o", "ko", "Mo", "Go", "To"] as const

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${BYTE_UNITS[unit]}`
}

export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function formatRelative(
  value: string | Date | null,
  now: Date = new Date()
): string {
  if (!value) {
    return "jamais"
  }

  const elapsed = now.getTime() - new Date(value).getTime()

  if (elapsed < MINUTE_MS) {
    return "à l'instant"
  }

  if (elapsed < HOUR_MS) {
    return `il y a ${Math.floor(elapsed / MINUTE_MS)} min`
  }

  if (elapsed < DAY_MS) {
    return `il y a ${Math.floor(elapsed / HOUR_MS)} h`
  }

  return `il y a ${Math.floor(elapsed / DAY_MS)} j`
}
