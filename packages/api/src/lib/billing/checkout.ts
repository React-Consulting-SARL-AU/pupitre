import { appUrlFromEnv } from "./config"
import type { BillingIntervalName } from "./provider"
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
}

export const CHECKOUT_RETURNS = ["billing", "start"] as const

export type CheckoutReturn = (typeof CHECKOUT_RETURNS)[number]

const RETURN_PATHS: Record<CheckoutReturn, string> = {
  billing: "/dashboard/billing",
  start: "/dashboard/start",
}

export interface CheckoutInput {
  quantity: number
  interval: BillingIntervalName
  return_to?: CheckoutReturn
}

function appUrl(path: string): string {
  return `${appUrlFromEnv().replace(TRAILING_SLASHES_RE, "")}${path}`
}

function returnUrl(destination: CheckoutReturn, query: string): string {
  return appUrl(`${RETURN_PATHS[destination]}${query}`)
}

export async function startCheckout(
  actor: CheckoutActor,
  input: CheckoutInput
): Promise<{ url: string }> {
  const billing = await readBilling(actor.organizationId)
  const destination = input.return_to ?? "billing"
  const session = await getBillingProvider().createCheckoutSession({
    organizationId: actor.organizationId,
    customerId: billing?.stripeCustomerId ?? null,
    customerEmail: actor.email,
    quantity: input.quantity,
    interval: input.interval,
    successUrl: returnUrl(destination, "?checkout=done"),
    cancelUrl: returnUrl(destination, "?checkout=cancelled"),
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
    returnUrl: appUrl(RETURN_PATHS.billing),
  })

  return { url: session.url }
}
