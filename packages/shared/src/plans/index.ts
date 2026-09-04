export type PlanId = "solo" | "team" | "hosted"

export interface Plan {
  id: PlanId
  name: string
  nameFr: string
  monthlyPriceEur: number
  billedPer: "server" | "month"
  startingAt: boolean
}

export const PLANS: readonly Plan[] = [
  {
    id: "solo",
    name: "Solo",
    nameFr: "Solo",
    monthlyPriceEur: 19,
    billedPer: "server",
    startingAt: false,
  },
  {
    id: "team",
    name: "Team",
    nameFr: "Équipe",
    monthlyPriceEur: 19,
    billedPer: "server",
    startingAt: false,
  },
  {
    id: "hosted",
    name: "Hosted",
    nameFr: "Hébergé",
    monthlyPriceEur: 29,
    billedPer: "month",
    startingAt: true,
  },
]

export const ANNUAL_FREE_MONTHS = 2
export const TRIAL_DAYS = 14

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id)

  if (!plan) {
    throw new Error(`Unknown plan: ${id}`)
  }

  return plan
}
