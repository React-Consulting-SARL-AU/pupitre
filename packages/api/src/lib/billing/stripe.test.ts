import { afterEach, describe, expect, it } from "bun:test"
import type { StripeConfig } from "./config"
import { createStripeBilling } from "./stripe"

const CONFIG: StripeConfig = {
  secretKey: "sk_test_pupitre",
  prices: { month: "price_month", year: "price_year" },
  appUrl: "https://app.pupitre.studio",
}

interface StripeCall {
  path: string
  method: string
  body: URLSearchParams
}

const realFetch = globalThis.fetch

function stubStripe(payload: unknown): StripeCall[] {
  const calls: StripeCall[] = []

  globalThis.fetch = ((input: string, init: RequestInit) => {
    calls.push({
      path: String(input),
      method: init.method ?? "GET",
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

function checkout(interval: "month" | "year") {
  return createStripeBilling(CONFIG).createCheckoutSession({
    organizationId: "org_1",
    customerId: null,
    customerEmail: "owner@example.com",
    quantity: 2,
    interval,
    successUrl: "https://app.pupitre.studio/dashboard/billing?checkout=done",
    cancelUrl:
      "https://app.pupitre.studio/dashboard/billing?checkout=cancelled",
  })
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("createCheckoutSession", () => {
  it("requires a card and offers no trial", async () => {
    const calls = stubStripe({
      id: "cs_test_second",
      url: "https://checkout.test/second",
    })

    await checkout("month")

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

  it("sells through Managed Payments, with no currency or tax handling on our side", async () => {
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

  it("takes the price of the requested interval", async () => {
    const calls = stubStripe({
      id: "cs_test_2",
      url: "https://checkout.test/2",
    })

    await checkout("year")

    expect(calls[0].body.get("line_items[0][price]")).toBe("price_year")
  })
})

describe("cancelSubscription", () => {
  it("cancels immediately via DELETE and returns what Stripe answers", async () => {
    const calls = stubStripe({
      id: "sub_1",
      customer: "cus_1",
      status: "canceled",
      current_period_end: 1_800_000_000,
      items: { data: [{ id: "si_1", quantity: 3, price: { product: "p" } }] },
    })

    const canceled =
      await createStripeBilling(CONFIG).cancelSubscription("sub_1")

    expect(calls[0].method).toBe("DELETE")
    expect(calls[0].path).toBe("https://api.stripe.com/v1/subscriptions/sub_1")
    expect(canceled).toMatchObject({
      id: "sub_1",
      status: "canceled",
      quantity: 3,
      current_period_end: new Date(1_800_000_000_000),
    })
  })
})
