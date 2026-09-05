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
    monthlyPriceUsd: 19,
    billedPer: "server",
    startingAt: false,
    maxServers: 2,
    availability: "available",
  },
  {
    id: "team",
    name: "Team",
    nameFr: "Équipe",
    monthlyPriceUsd: 19,
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

/** Serveurs enrôlables sans abonnement. */
export const FREE_SEAT_QUOTA = 2
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
