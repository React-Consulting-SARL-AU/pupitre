import { appUrlFromEnv } from "./config"
import type { BillingCurrency, BillingIntervalName } from "./provider"
import { getBillingProvider } from "./runtime"
import { readBilling } from "./subscription"

const TRAILING_SLASHES_RE = /\/+$/

export class BillingCustomerMissingError extends Error {
  constructor() {
    super("this organization has no Stripe customer yet")
    this.name = "BillingCustomerMissingError"
  }
}

export interface CheckoutActor {
  organizationId: string
  email: string
  currency: BillingCurrency
}

export interface CheckoutInput {
  quantity: number
  interval: BillingIntervalName
}

function billingUrl(query: string): string {
  return `${appUrlFromEnv().replace(TRAILING_SLASHES_RE, "")}/dashboard/billing${query}`
}

export async function startCheckout(
  actor: CheckoutActor,
  input: CheckoutInput
): Promise<{ url: string }> {
  const billing = await readBilling(actor.organizationId)
  const session = await getBillingProvider().createCheckoutSession({
    organizationId: actor.organizationId,
    customerId: billing?.stripeCustomerId ?? null,
    customerEmail: actor.email,
    quantity: input.quantity,
    interval: input.interval,
    currency: actor.currency,
    successUrl: billingUrl("?checkout=done"),
    cancelUrl: billingUrl("?checkout=cancelled"),
  })

  return { url: session.url }
}

export async function startPortal(
  organizationId: string
): Promise<{ url: string }> {
  const billing = await readBilling(organizationId)

  if (!billing) {
    throw new BillingCustomerMissingError()
  }

  const session = await getBillingProvider().createPortalSession({
    customerId: billing.stripeCustomerId,
    returnUrl: billingUrl(""),
  })

  return { url: session.url }
}
