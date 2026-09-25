import { z } from "zod"
import { InstantSchema } from "../platform-api"

export const PLAN_IDS = ["solo", "team", "hosted"] as const

export const PlanIdSchema = z.enum(PLAN_IDS)

export type PlanId = z.infer<typeof PlanIdSchema>

export const BILLING_INTERVALS = ["month", "year"] as const

export const BillingIntervalSchema = z.enum(BILLING_INTERVALS)

export type BillingInterval = z.infer<typeof BillingIntervalSchema>

export const PlanSchema = z.object({
  id: PlanIdSchema,
  name: z.string().min(1),
  nameFr: z.string().min(1),
  monthlyPriceUsd: z.number().nonnegative(),
  billedPer: z.enum(["server", "month"]),
  startingAt: z.boolean(),
  maxServers: z.int().positive().nullable(),
  availability: z.enum(["available", "later"]),
})

export type Plan = z.infer<typeof PlanSchema>

export const PLANS: readonly Plan[] = [
  {
    id: "solo",
    name: "Solo",
    nameFr: "Solo",
    monthlyPriceUsd: 5,
    billedPer: "server",
    startingAt: false,
    maxServers: 2,
    availability: "available",
  },
  {
    id: "team",
    name: "Team",
    nameFr: "Équipe",
    monthlyPriceUsd: 5,
    billedPer: "server",
    startingAt: false,
    maxServers: null,
    availability: "available",
  },
  {
    id: "hosted",
    name: "Hosted",
    nameFr: "Hébergé",
    monthlyPriceUsd: 29,
    billedPer: "month",
    startingAt: true,
    maxServers: null,
    availability: "later",
  },
]

export const ANNUAL_FREE_MONTHS = 2

export const TRIAL_DAYS = 30
export const TRIAL_REQUIRES_CARD = false

// A trial, and the free launch, cover one machine; more seats come with payment.
export const TRIAL_SEATS = 1

export const BILLING_MODES = ["stripe", "launch"] as const

export const BillingModeSchema = z.enum(BILLING_MODES)

export type BillingMode = z.infer<typeof BillingModeSchema>

export const LAUNCH_PRODUCT = "launch"

export const GRANTED_PRODUCT = "granted"

// No Stripe counterpart: never reconciled, never resized, never given a portal.
export const PLATFORM_PRODUCTS: readonly string[] = [
  LAUNCH_PRODUCT,
  GRANTED_PRODUCT,
]

// Stripe still bills under these: an organization's subscription is the last touched of them.
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"]

export function isLiveSubscriptionStatus(status: string): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.includes(status)
}

// The platform lists them per row; the console only shows them.
export const SUBSCRIPTION_ACTIONS = [
  "resize",
  "extend_trial",
  "resume",
  "cancel",
  "delete",
] as const

export type SubscriptionAction = (typeof SUBSCRIPTION_ACTIONS)[number]

export function isPlatformProduct(product: string): boolean {
  return PLATFORM_PRODUCTS.includes(product)
}

// Stripe renames its own products, so a row it bills is labelled by this rather than by their identifier.
export const STRIPE_PRODUCT = "stripe"

export const LAUNCH_SEATS = TRIAL_SEATS

// The platform's own organization enrols what it needs during the launch.
export const LAUNCH_ADMIN_SEATS = 100

// A site test holds it equal to the platform's `LAUNCH_ENDS_AT`.
export const ANNOUNCED_LAUNCH_ENDS_AT = "2026-12-31T23:59:59Z"

export const AFFILIATE_CODE_LENGTH = 8

export const AFFILIATE_CODE_RE = /^[a-z0-9-]{3,32}$/

export const AFFILIATE_COOKIE = "pupitre_ref"

export const AFFILIATE_COOKIE_DAYS = 90

export const AFFILIATE_MAX_FREE_MONTHS = 24

export const AFFILIATE_PARTNER_NAME_MAX_LENGTH = 120

export const AFFILIATE_NOTES_MAX_LENGTH = 2000

// Day buckets, today included.
export const AFFILIATE_CLICK_WINDOW_DAYS = 30

export const DAYS_PER_FREE_MONTH = 30

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id)

  if (!plan) {
    throw new Error(`Unknown plan: ${id}`)
  }

  return plan
}

export function yearlyPriceUsd(plan: Plan): number {
  return plan.monthlyPriceUsd * (12 - ANNUAL_FREE_MONTHS)
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function formatUsd(amount: number): string {
  return USD.format(amount)
}

// No plan here: Solo and Team share one Stripe product, and the mirror names neither.
export const MeSubscriptionSchema = z.object({
  status: z.string().min(1),
  // Stripe ends the first period with the trial; null once no trial runs.
  trial_ends_at: InstantSchema.nullable(),
  current_period_end: InstantSchema.nullable(),
  servers: z.object({
    used: z.int().nonnegative(),
    limit: z.int().nonnegative(),
  }),
})

export type MeSubscription = z.infer<typeof MeSubscriptionSchema>

export const TRIAL_WARN_DAYS = 3

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
