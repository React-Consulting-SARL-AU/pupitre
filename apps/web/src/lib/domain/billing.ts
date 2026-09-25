import {
  ANNUAL_FREE_MONTHS,
  BILLING_INTERVALS,
  type BillingInterval,
  type BillingMode,
  getPlan,
  isPlatformProduct,
  LAUNCH_PRODUCT,
} from "@pupitre/shared/plans"
import type { StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

export type BillingIntervalName = BillingInterval

export type CheckoutReturn = "billing" | "start"

export const INTERVAL_KEYS: Record<BillingIntervalName, DictionaryKey> = {
  month: "billing.interval.month",
  year: "billing.interval.year",
}

export const SEAT_PRICE_USD_PER_MONTH = getPlan("team").monthlyPriceUsd

const BILLED_MONTHS_PER_YEAR = 12 - ANNUAL_FREE_MONTHS

const STATUS_LOOKS: Record<string, StatusLook> = {
  active: { shape: "filled", tone: "ok", label: "billing.status.active" },
  trialing: {
    shape: "breathing",
    tone: "muted",
    label: "billing.status.trialing",
  },
  past_due: { shape: "hollow", tone: "warn", label: "billing.status.past_due" },
  incomplete: {
    shape: "hollow",
    tone: "warn",
    label: "billing.status.incomplete",
  },
  paused: { shape: "hollow", tone: "warn", label: "billing.status.paused" },
  unpaid: { shape: "barred", tone: "danger", label: "billing.status.unpaid" },
  canceled: {
    shape: "barred",
    tone: "muted",
    label: "billing.status.canceled",
  },
  incomplete_expired: {
    shape: "barred",
    tone: "muted",
    label: "billing.status.incomplete_expired",
  },
}

const LAUNCH_LOOK: StatusLook = {
  shape: "filled",
  tone: "ok",
  label: "billing.status.launch",
}

export interface SubscriptionProduct {
  product: string | null
  status: string
}

export function isLaunchSubscription({
  product,
}: SubscriptionProduct): boolean {
  return product === LAUNCH_PRODUCT
}

export function isLaunchSeatKept(subscription: SubscriptionProduct): boolean {
  return isLaunchSubscription(subscription) && subscription.status === "active"
}

// A trial holds one machine, and platform products have no Stripe quantity to resize.
export function seatsLocked({ status, product }: SubscriptionProduct): boolean {
  return (
    status === "trialing" || (product !== null && isPlatformProduct(product))
  )
}

// A status Stripe adds later has no look of ours: null.
export function subscriptionStatusLook(
  status: string,
  product: string | null = null
): StatusLook | null {
  if (status === "trialing" && isLaunchSubscription({ product, status })) {
    return LAUNCH_LOOK
  }

  return STATUS_LOOKS[status] ?? null
}

export interface BillingStatus {
  mode: BillingMode
  launch_ends_at: string | null
}

export const START_PROMISES: DictionaryKey[] = [
  "start.gives.enrol",
  "start.gives.catalogue",
  "start.gives.yours",
]

export type StartOfferKind = "trial" | "launch"

export interface StartOffer {
  kind: StartOfferKind
  endsAt: string | null
  title: DictionaryKey
  action: DictionaryKey
  actionPending: DictionaryKey
  failed: DictionaryKey
}

const TRIAL_OFFER: StartOffer = {
  kind: "trial",
  endsAt: null,
  title: "start.trialTitle",
  action: "start.action",
  actionPending: "start.actionPending",
  failed: "start.failed",
}

// Until `/status` answers, the trial is offered: it is the offer outside the launch.
export function startOffer(
  billing: BillingStatus | null | undefined
): StartOffer {
  if (billing?.mode !== "launch") {
    return TRIAL_OFFER
  }

  return {
    kind: "launch",
    endsAt: billing.launch_ends_at,
    title: "start.launchTitle",
    action: "start.launchAction",
    actionPending: "start.launchActionPending",
    failed: "start.launchFailed",
  }
}

export function amountUsd(
  quantity: number,
  interval: BillingIntervalName | null
): number {
  const months = interval === "year" ? BILLED_MONTHS_PER_YEAR : 1

  return quantity * SEAT_PRICE_USD_PER_MONTH * months
}

const MS_PER_DAY = 86_400_000

// A day that has begun still counts: Stripe bills at the end of the last one.
export function trialDaysLeft(
  endsAt: string | Date | null,
  now: Date = new Date()
): number | null {
  if (!endsAt) {
    return null
  }

  const end = new Date(endsAt).getTime()

  if (Number.isNaN(end)) {
    return null
  }

  return Math.max(0, Math.ceil((end - now.getTime()) / MS_PER_DAY))
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
