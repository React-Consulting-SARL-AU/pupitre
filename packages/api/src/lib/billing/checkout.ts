import { isPlatformProduct } from "@pupitre/shared/plans"
import { recordReferral } from "../affiliates/affiliates"
import { appUrlFromEnv } from "./config"
import type { BillingIntervalName } from "./provider"
import { assertBillingOn, getBillingProvider } from "./runtime"
import {
  billedSubscriptionOf,
  liveSubscriptionOf,
  readBilling,
} from "./subscription"

export class BillingCustomerMissingError extends Error {
  constructor() {
    super("this organization has no Stripe customer yet")
    this.name = "BillingCustomerMissingError"
  }
}

export class BillingGrantedError extends Error {
  constructor() {
    super("the platform granted this licence: there is no Stripe portal")
    this.name = "BillingGrantedError"
  }
}

export class BillingAlreadySubscribedError extends Error {
  constructor() {
    super("this organization already pays a live Stripe subscription")
    this.name = "BillingAlreadySubscribedError"
  }
}

export interface CheckoutActor {
  organizationId: string
  userId: string
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
  affiliate_code?: string
}

function appUrl(path: string): string {
  return `${appUrlFromEnv()}${path}`
}

function returnUrl(destination: CheckoutReturn, query: string): string {
  return appUrl(`${RETURN_PATHS[destination]}${query}`)
}

export async function startCheckout(
  actor: CheckoutActor,
  input: CheckoutInput
): Promise<{ url: string }> {
  assertBillingOn()

  const { organizationId } = actor
  const destination = input.return_to ?? "billing"

  if (input.affiliate_code) {
    await recordReferral(
      { organizationId, userId: actor.userId },
      input.affiliate_code
    )
  }

  if (await billedSubscriptionOf(organizationId)) {
    throw new BillingAlreadySubscribedError()
  }

  const billing = await readBilling(organizationId)
  const session = await getBillingProvider().createCheckoutSession({
    organizationId,
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
  assertBillingOn()

  const [billed, live] = await Promise.all([
    billedSubscriptionOf(organizationId),
    liveSubscriptionOf(organizationId),
  ])

  if (!billed && live && isPlatformProduct(live.product)) {
    throw new BillingGrantedError()
  }

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
