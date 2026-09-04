import { createFakeBilling, type FakeBilling } from "../lib/billing/fake"
import type { RemoteSubscription } from "../lib/billing/provider"
import { configureBilling } from "../lib/billing/runtime"
import { signStripePayload } from "../lib/billing/signature"
import { bootApiTestServer, TEST_BASE_URL } from "./index"
import type { TestResponse } from "./request"

export const TEST_WEBHOOK_SECRET = "whsec_pupitre_test_secret"

let fake: FakeBilling | null = null

export function useFakeBilling(): FakeBilling {
  fake ??= createFakeBilling()
  fake.reset()

  configureBilling({ provider: fake, webhookSecret: TEST_WEBHOOK_SECRET })

  return fake
}

export interface SubscriptionFixture {
  id?: string
  customerId?: string
  organizationId?: string | null
  status?: string
  quantity?: number
  interval?: "month" | "year"
  currentPeriodEnd?: Date | null
}

export function remoteSubscription({
  id = "sub_test_1",
  customerId = "cus_test_1",
  organizationId = null,
  status = "active",
  quantity = 2,
  interval = "month",
  currentPeriodEnd = null,
}: SubscriptionFixture = {}): RemoteSubscription {
  return {
    id,
    customer_id: customerId,
    status,
    product: "prod_server",
    quantity,
    interval,
    current_period_end: currentPeriodEnd,
    organization_id: organizationId,
  }
}

export function stripeSubscriptionObject(
  fixture: SubscriptionFixture = {}
): Record<string, unknown> {
  const remote = remoteSubscription(fixture)

  return {
    id: remote.id,
    object: "subscription",
    customer: remote.customer_id,
    status: remote.status,
    metadata: remote.organization_id
      ? { organization_id: remote.organization_id }
      : {},
    items: {
      data: [
        {
          id: `si_${remote.id}`,
          quantity: remote.quantity,
          current_period_end: remote.current_period_end
            ? Math.floor(remote.current_period_end.getTime() / 1000)
            : undefined,
          price: {
            id: "price_server_eur_month",
            product: remote.product,
            recurring: { interval: remote.interval },
          },
        },
      ],
    },
  }
}

let eventCounter = 0

export function stripeEvent(
  type: string,
  object: Record<string, unknown>,
  id?: string
): Record<string, unknown> {
  eventCounter += 1

  return {
    id: id ?? `evt_test_${eventCounter}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  }
}

export interface WebhookRequestInit {
  secret?: string
  signature?: string
  signedAt?: Date
}

export async function postStripeWebhook<T = unknown>(
  event: unknown,
  init: WebhookRequestInit = {}
): Promise<TestResponse<T>> {
  const payload = JSON.stringify(event)
  const signature =
    init.signature ??
    (await signStripePayload(
      payload,
      init.secret ?? TEST_WEBHOOK_SECRET,
      init.signedAt ?? new Date()
    ))
  const { fetch } = await bootApiTestServer()
  const raw = await fetch(`${TEST_BASE_URL}/api/v1/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  })
  const text = await raw.text()

  return {
    status: raw.status,
    json: (text.length > 0 ? JSON.parse(text) : null) as T,
    raw,
  }
}
