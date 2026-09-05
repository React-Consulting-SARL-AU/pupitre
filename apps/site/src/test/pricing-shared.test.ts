import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { Plan } from "@pupitre/shared/plans"
import { describe, expect, it, vi } from "vitest"
import Fr from "../pages/fr/pricing.astro"
import En from "../pages/pricing.astro"
import { render } from "./render"

const MOCKED_PLANS = vi.hoisted<Plan[]>(() => [
  {
    id: "solo",
    name: "Solo",
    nameFr: "Solo",
    monthlyPriceUsd: 23,
    billedPer: "server",
    startingAt: false,
    maxServers: 3,
    availability: "available",
  },
  {
    id: "team",
    name: "Team",
    nameFr: "Équipe",
    monthlyPriceUsd: 23,
    billedPer: "server",
    startingAt: false,
    maxServers: null,
    availability: "available",
  },
  {
    id: "hosted",
    name: "Hosted",
    nameFr: "Hébergé",
    monthlyPriceUsd: 41,
    billedPer: "month",
    startingAt: true,
    maxServers: null,
    availability: "later",
  },
])

vi.mock("@pupitre/shared/plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pupitre/shared/plans")>()

  return {
    ...actual,
    PLANS: MOCKED_PLANS,
    TRIAL_DAYS: 21,
    getPlan: (id: Plan["id"]) =>
      MOCKED_PLANS.find((plan) => plan.id === id) as Plan,
  }
})

const SOURCE_RE = /\.(ts|astro)$/
const TEST_RE = /\.test\.ts$/

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      sources(full, out)
    } else if (SOURCE_RE.test(entry.name) && !TEST_RE.test(entry.name)) {
      out.push(full)
    }
  }

  return out
}

describe("pricing page follows @pupitre/shared/plans", () => {
  it("shows the mocked prices, caps and trial without any edit", async () => {
    for (const [page, path] of [
      [En, "/pricing/"],
      [Fr, "/fr/pricing/"],
    ] as const) {
      const html = await render(page, { path })

      expect(html).toContain("$23")
      expect(html).toContain("$230")
      expect(html).toContain("$41")
      expect(html).toContain("21")
      expect(html).toContain("3 serv")
      expect(html).not.toContain("$19")
      expect(html).not.toContain("$190")
      expect(html).not.toContain("$29")
      expect(html).toContain('"price":"23"')
      expect(html).toContain('"price":"230"')
      expect(html).not.toContain('"price":"19"')
    }
  })

  it("has no shared price literal anywhere in the site sources", async () => {
    const actual = await vi.importActual<
      typeof import("@pupitre/shared/plans")
    >("@pupitre/shared/plans")
    const amounts = new Set(
      actual.PLANS.flatMap((plan) => [
        plan.monthlyPriceUsd,
        actual.yearlyPriceUsd(plan),
      ])
    )
    amounts.add(actual.TRIAL_DAYS)
    const root = path.resolve(import.meta.dirname, "..")

    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8")

      for (const amount of amounts) {
        const literal = new RegExp(`(?<![\\w.\\-#])${amount}(?![\\w.%])`)

        expect(
          text,
          `${path.relative(root, file)} prints ${amount}`
        ).not.toMatch(literal)
      }
    }
  })
})
