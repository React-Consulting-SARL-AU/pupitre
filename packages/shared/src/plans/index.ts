import { z } from "zod"

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
    monthlyPriceUsd: 10,
    billedPer: "server",
    startingAt: false,
    maxServers: 2,
    availability: "available",
  },
  {
    id: "team",
    name: "Team",
    nameFr: "Équipe",
    monthlyPriceUsd: 10,
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

export const TRIAL_DAYS = 14
export const TRIAL_REQUIRES_CARD = false

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

/**
 * The subscription of the active organization, as `GET /me` tells the app.
 *
 * It carries what the Stripe mirror holds and nothing more: the status in
 * Stripe's own words, the end of the period, the seats paid against the
 * servers that occupy one. While a trial runs, Stripe ends the first period
 * with it, so `trial_ends_at` is that date and null otherwise. The plan is not
 * here: Solo and Team share one product, and the mirror does not name either.
 */
export const MeSubscriptionSchema = z.object({
  status: z.string().min(1),
  trial_ends_at: z.string().nullable(),
  current_period_end: z.string().nullable(),
  servers: z.object({
    used: z.int().nonnegative(),
    limit: z.int().nonnegative(),
  }),
})

export type MeSubscription = z.infer<typeof MeSubscriptionSchema>

/** Under this, a trial is about to end and the app says so in a warning tone. */
export const TRIAL_WARN_DAYS = 3

const MS_PER_DAY = 86_400_000

/** A day that has begun still counts: Stripe bills at the end of the last one. */
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
