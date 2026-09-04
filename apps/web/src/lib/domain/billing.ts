import { ANNUAL_FREE_MONTHS, getPlan } from "@pupitre/shared/plans"
import type { StatusLook } from "@/lib/domain/server-status"

export const BILLING_INTERVALS = ["month", "year"] as const

export type BillingIntervalName = (typeof BILLING_INTERVALS)[number]

export const INTERVAL_LABELS: Record<BillingIntervalName, string> = {
  month: "Mensuel",
  year: "Annuel",
}

export const SEAT_PRICE_EUR_PER_MONTH = getPlan("team").monthlyPriceEur

const BILLED_MONTHS_PER_YEAR = 12 - ANNUAL_FREE_MONTHS

const STATUS_LOOKS: Record<string, StatusLook> = {
  active: { shape: "filled", tone: "ok", label: "Actif" },
  trialing: { shape: "breathing", tone: "muted", label: "Essai" },
  past_due: { shape: "hollow", tone: "warn", label: "Paiement en retard" },
  incomplete: { shape: "hollow", tone: "warn", label: "Paiement incomplet" },
  paused: { shape: "hollow", tone: "warn", label: "En pause" },
  unpaid: { shape: "barred", tone: "danger", label: "Impayé" },
  canceled: { shape: "barred", tone: "muted", label: "Résilié" },
  incomplete_expired: { shape: "barred", tone: "muted", label: "Expiré" },
}

export function subscriptionStatusLook(status: string): StatusLook {
  return (
    STATUS_LOOKS[status] ?? { shape: "hollow", tone: "muted", label: status }
  )
}

export function amountEur(
  quantity: number,
  interval: BillingIntervalName | null
): number {
  const months = interval === "year" ? BILLED_MONTHS_PER_YEAR : 1

  return quantity * SEAT_PRICE_EUR_PER_MONTH * months
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export type SeatVerdict = "matched" | "unused" | "over_quota"

export interface SeatBalance {
  paid: number
  used: number
  spare: number
  verdict: SeatVerdict
}

function verdictOf(spare: number): SeatVerdict {
  if (spare > 0) {
    return "unused"
  }

  return spare < 0 ? "over_quota" : "matched"
}

export function seatBalance(paid: number, used: number): SeatBalance {
  const spare = paid - used

  return { paid, used, spare, verdict: verdictOf(spare) }
}

export function isBillingIntervalName(
  value: unknown
): value is BillingIntervalName {
  return (BILLING_INTERVALS as readonly unknown[]).includes(value)
}
