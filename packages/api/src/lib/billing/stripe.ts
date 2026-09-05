import { TRIAL_DAYS, TRIAL_REQUIRES_CARD } from "@pupitre/shared/plans"
import type { StripeConfig } from "./config"
import {
  BILLING_INTERVALS,
  type BillingIntervalName,
  type BillingProvider,
  BillingProviderError,
  type BillingSession,
  type CheckoutSessionInput,
  type PortalSessionInput,
  type RemoteSubscription,
} from "./provider"

const STRIPE_API_BASE = "https://api.stripe.com/v1"

const STRIPE_API_VERSION = "2025-08-27.basil"

type FormValue = string | number | boolean | null | undefined

interface FormTree {
  [key: string]: FormValue | FormTree
}

function appendForm(
  target: URLSearchParams,
  prefix: string,
  tree: FormTree
): void {
  for (const [key, value] of Object.entries(tree)) {
    if (value === null || value === undefined) {
      continue
    }

    const path = prefix ? `${prefix}[${key}]` : key

    if (typeof value === "object") {
      appendForm(target, path, value)

      continue
    }

    target.set(path, String(value))
  }
}

export function encodeForm(tree: FormTree): string {
  const params = new URLSearchParams()

  appendForm(params, "", tree)

  return params.toString()
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") {
    return value
  }

  if (value && typeof value === "object" && "id" in value) {
    const { id } = value as { id: unknown }

    return typeof id === "string" ? id : null
  }

  return null
}

function secondsToDate(value: unknown): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null
}

interface StripeSubscriptionItem {
  id?: string
  quantity?: number
  current_period_end?: number
  price?: { product?: unknown; id?: string; recurring?: { interval?: string } }
}

export interface StripeSubscriptionPayload {
  id?: string
  customer?: unknown
  status?: string
  quantity?: number
  current_period_end?: number
  metadata?: Record<string, string> | null
  items?: { data?: StripeSubscriptionItem[] }
}

function intervalOf(value: unknown): BillingIntervalName | null {
  return BILLING_INTERVALS.find((interval) => interval === value) ?? null
}

export function toRemoteSubscription(
  payload: StripeSubscriptionPayload
): RemoteSubscription {
  const item = payload.items?.data?.[0]

  return {
    id: payload.id ?? "",
    customer_id: idOf(payload.customer) ?? "",
    status: payload.status ?? "incomplete",
    product: idOf(item?.price?.product) ?? "",
    quantity: item?.quantity ?? payload.quantity ?? 1,
    interval: intervalOf(item?.price?.recurring?.interval),
    current_period_end:
      secondsToDate(payload.current_period_end) ??
      secondsToDate(item?.current_period_end),
    organization_id: payload.metadata?.organization_id ?? null,
  }
}

export function createStripeBilling(config: StripeConfig): BillingProvider {
  async function call<T>(
    path: string,
    init: { method: "GET" | "POST"; body?: FormTree } = { method: "GET" }
  ): Promise<T> {
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(init.body
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: init.body ? encodeForm(init.body) : undefined,
    })
    const payload = (await response.json()) as {
      error?: { message?: string }
    } & T

    if (!response.ok) {
      throw new BillingProviderError(
        response.status,
        payload.error?.message ?? `Stripe refused ${init.method} ${path}`
      )
    }

    return payload
  }

  async function retrieve(
    subscriptionId: string
  ): Promise<StripeSubscriptionPayload> {
    return await call<StripeSubscriptionPayload>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`
    )
  }

  return {
    async createCheckoutSession(
      input: CheckoutSessionInput
    ): Promise<BillingSession> {
      const price = config.prices[input.interval]
      const session = await call<{ id?: string; url?: string }>(
        "/checkout/sessions",
        {
          method: "POST",
          body: {
            mode: "subscription",
            managed_payments: { enabled: true },
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            client_reference_id: input.organizationId,
            customer: input.customerId,
            customer_email: input.customerId ? null : input.customerEmail,
            allow_promotion_codes: true,
            line_items: { 0: { price, quantity: input.quantity } },
            metadata: { organization_id: input.organizationId },
            // Sans carte demandée, c'est Stripe qui résilie à la fin de l'essai :
            // l'abonnement passe en `canceled`, le webhook suspend, rien à compter ici.
            payment_method_collection: TRIAL_REQUIRES_CARD
              ? "always"
              : "if_required",
            subscription_data: {
              metadata: { organization_id: input.organizationId },
              trial_period_days: TRIAL_DAYS,
              trial_settings: {
                end_behavior: {
                  missing_payment_method: TRIAL_REQUIRES_CARD
                    ? "create_invoice"
                    : "cancel",
                },
              },
            },
          },
        }
      )

      if (!session.url) {
        throw new BillingProviderError(502, "Stripe returned no checkout URL")
      }

      return { id: session.id ?? "", url: session.url }
    },

    async createPortalSession(
      input: PortalSessionInput
    ): Promise<BillingSession> {
      const session = await call<{ id?: string; url?: string }>(
        "/billing_portal/sessions",
        {
          method: "POST",
          body: { customer: input.customerId, return_url: input.returnUrl },
        }
      )

      if (!session.url) {
        throw new BillingProviderError(502, "Stripe returned no portal URL")
      }

      return { id: session.id ?? "", url: session.url }
    },

    async retrieveSubscription(
      subscriptionId: string
    ): Promise<RemoteSubscription> {
      return toRemoteSubscription(await retrieve(subscriptionId))
    },

    async updateQuantity(
      subscriptionId: string,
      quantity: number
    ): Promise<RemoteSubscription> {
      const current = await retrieve(subscriptionId)
      const itemId = current.items?.data?.[0]?.id

      if (!itemId) {
        throw new BillingProviderError(
          422,
          `Subscription ${subscriptionId} carries no item to resize`
        )
      }

      const updated = await call<StripeSubscriptionPayload>(
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          method: "POST",
          body: {
            proration_behavior: "create_prorations",
            items: { 0: { id: itemId, quantity } },
          },
        }
      )

      return toRemoteSubscription(updated)
    },
  }
}
