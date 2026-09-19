import { afterEach, describe, expect, it } from "bun:test"
import { TRIAL_DAYS } from "@pupitre/shared/plans"
import type { StripeConfig } from "./config"
import { createStripeBilling } from "./stripe"

const CONFIG: StripeConfig = {
  secretKey: "sk_test_pupitre",
  prices: { month: "price_month", year: "price_year" },
  appUrl: "https://app.pupitre.studio",
}

interface StripeCall {
  path: string
  body: URLSearchParams
}

const realFetch = globalThis.fetch

function stubStripe(payload: unknown): StripeCall[] {
  const calls: StripeCall[] = []

  globalThis.fetch = ((input: string, init: RequestInit) => {
    calls.push({
      path: String(input),
      body: new URLSearchParams(String(init.body ?? "")),
    })

    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  }) as typeof fetch

  return calls
}

function checkout(
  interval: "month" | "year",
  trialDays: number | null = TRIAL_DAYS
) {
  return createStripeBilling(CONFIG).createCheckoutSession({
    organizationId: "org_1",
    customerId: null,
    customerEmail: "owner@example.com",
    quantity: 2,
    interval,
    trialDays,
    successUrl: "https://app.pupitre.studio/dashboard/billing?checkout=done",
    cancelUrl:
      "https://app.pupitre.studio/dashboard/billing?checkout=cancelled",
  })
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("createCheckoutSession", () => {
  it("laisse Stripe tenir l'essai, et résilier quand il finit sans carte", async () => {
    const calls = stubStripe({
      id: "cs_test_trial",
      url: "https://checkout.test/trial",
    })

    await checkout("month")

    const { body } = calls[0]

    expect(body.get("subscription_data[trial_period_days]")).toBe(
      String(TRIAL_DAYS)
    )
    expect(body.get("payment_method_collection")).toBe("if_required")
    expect(
      body.get(
        "subscription_data[trial_settings][end_behavior][missing_payment_method]"
      )
    ).toBe("cancel")
  })

  it("envoie les jours d'essai du lien d'affiliation", async () => {
    const calls = stubStripe({
      id: "cs_test_referred",
      url: "https://checkout.test/referred",
    })

    await checkout("month", 90)

    expect(calls[0].body.get("subscription_data[trial_period_days]")).toBe("90")
  })

  it("exige une carte et n'offre aucun essai après le premier checkout", async () => {
    const calls = stubStripe({
      id: "cs_test_second",
      url: "https://checkout.test/second",
    })

    await checkout("month", null)

    const { body } = calls[0]

    expect(body.get("payment_method_collection")).toBe("always")
    expect(body.get("subscription_data[trial_period_days]")).toBeNull()
    expect(
      body.get(
        "subscription_data[trial_settings][end_behavior][missing_payment_method]"
      )
    ).toBeNull()
    expect(body.get("subscription_data[metadata][organization_id]")).toBe(
      "org_1"
    )
  })

  it("vend en Managed Payments, sans devise ni taxe à nous", async () => {
    const calls = stubStripe({
      id: "cs_test_1",
      url: "https://checkout.test/1",
    })

    await checkout("month")

    expect(calls).toHaveLength(1)

    const { path, body } = calls[0]

    expect(path).toEndWith("/checkout/sessions")
    expect(body.get("managed_payments[enabled]")).toBe("true")
    expect(body.get("mode")).toBe("subscription")
    expect(body.get("currency")).toBeNull()
    expect(body.get("automatic_tax[enabled]")).toBeNull()
    expect(body.get("line_items[0][price]")).toBe("price_month")
    expect(body.get("line_items[0][quantity]")).toBe("2")
    expect(body.get("client_reference_id")).toBe("org_1")
    expect(body.get("metadata[organization_id]")).toBe("org_1")
    expect(body.get("subscription_data[metadata][organization_id]")).toBe(
      "org_1"
    )
  })

  it("prend le prix de l'intervalle demandé", async () => {
    const calls = stubStripe({
      id: "cs_test_2",
      url: "https://checkout.test/2",
    })

    await checkout("year")

    expect(calls[0].body.get("line_items[0][price]")).toBe("price_year")
  })
})
