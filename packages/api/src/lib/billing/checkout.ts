import {
  DAYS_PER_FREE_MONTH,
  isPlatformProduct,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from "@pupitre/shared/plans"
import { recordReferral, referralLinkOf } from "../affiliates/affiliates"
import { getPrisma } from "../api/prisma"
import { appUrlFromEnv } from "./config"
import { grantLaunchSubscription, isLaunchMode } from "./launch"
import type { BillingIntervalName } from "./provider"
import { getBillingProvider } from "./runtime"
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

export class BillingLaunchError extends Error {
  constructor() {
    super("the launch grants the subscription: there is no Stripe portal")
    this.name = "BillingLaunchError"
  }
}

export class BillingGrantedError extends Error {
  constructor() {
    super("the platform granted this subscription: there is no Stripe portal")
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

interface TrialTerms {
  trialDays: number | null
  quantity: number
}

function appUrl(path: string): string {
  return `${appUrlFromEnv()}${path}`
}

function returnUrl(destination: CheckoutReturn, query: string): string {
  return appUrl(`${RETURN_PATHS[destination]}${query}`)
}

/**
 * One trial per organization: the first checkout opens it, on one machine or
 * on what the affiliate link promised; every later checkout is a paid one.
 */
async function trialTermsFor(
  organizationId: string,
  requested: number
): Promise<TrialTerms> {
  const previous = await getPrisma().subscription.count({
    where: { organizationId },
  })

  if (previous > 0) {
    return { trialDays: null, quantity: requested }
  }

  const link = await referralLinkOf(organizationId)

  return {
    trialDays:
      link && link.freeMonths > 0
        ? link.freeMonths * DAYS_PER_FREE_MONTH
        : TRIAL_DAYS,
    quantity: link?.seats ?? TRIAL_SEATS,
  }
}

export async function startCheckout(
  actor: CheckoutActor,
  input: CheckoutInput
): Promise<{ url: string }> {
  const { organizationId } = actor
  const destination = input.return_to ?? "billing"

  if (input.affiliate_code) {
    await recordReferral(
      { organizationId, userId: actor.userId },
      input.affiliate_code
    )
  }

  if (isLaunchMode()) {
    await grantLaunchSubscription(actor)

    return { url: returnUrl(destination, "?checkout=done") }
  }

  if (await billedSubscriptionOf(organizationId)) {
    throw new BillingAlreadySubscribedError()
  }

  const [billing, trial] = await Promise.all([
    readBilling(organizationId),
    trialTermsFor(organizationId, input.quantity),
  ])
  const session = await getBillingProvider().createCheckoutSession({
    organizationId,
    customerId: billing?.stripeCustomerId ?? null,
    customerEmail: actor.email,
    quantity: trial.quantity,
    interval: input.interval,
    trialDays: trial.trialDays,
    successUrl: returnUrl(destination, "?checkout=done"),
    cancelUrl: returnUrl(destination, "?checkout=cancelled"),
  })

  return { url: session.url }
}

export async function startPortal(
  organizationId: string
): Promise<{ url: string }> {
  if (isLaunchMode()) {
    throw new BillingLaunchError()
  }

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
