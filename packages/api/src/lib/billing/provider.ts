import { BillingInterval } from "@pupitre/db/cloudflare/enums"

export const BILLING_INTERVALS = [
  BillingInterval.month,
  BillingInterval.year,
] as const

export type BillingIntervalName = (typeof BILLING_INTERVALS)[number]

export interface CheckoutSessionInput {
  organizationId: string
  customerId: string | null
  customerEmail: string | null
  quantity: number
  interval: BillingIntervalName
  /** Null past the first checkout: no trial, and a card before anything opens. */
  trialDays: number | null
  successUrl: string
  cancelUrl: string
}

export interface PortalSessionInput {
  customerId: string
  returnUrl: string
}

export interface BillingSession {
  id: string
  url: string
}

export interface RemoteSubscription {
  id: string
  customer_id: string
  status: string
  product: string
  quantity: number
  interval: BillingIntervalName | null
  current_period_end: Date | null
  /** Still billed to the end of the period, and stopped there: not the same as stopped. */
  cancel_at_period_end: boolean
  organization_id: string | null
}

export interface BillingProvider {
  createCheckoutSession(input: CheckoutSessionInput): Promise<BillingSession>
  createPortalSession(input: PortalSessionInput): Promise<BillingSession>
  retrieveSubscription(subscriptionId: string): Promise<RemoteSubscription>
  updateQuantity(
    subscriptionId: string,
    quantity: number
  ): Promise<RemoteSubscription>
  /** Moves the end of a trial; the answer is what the mirror keeps. */
  extendTrial(subscriptionId: string, endsAt: Date): Promise<RemoteSubscription>
  /** Takes back a cancellation that was waiting for the end of the period. */
  resumeSubscription(subscriptionId: string): Promise<RemoteSubscription>
  /** Cancels now: the customer stops being billed, and the answer is what the mirror keeps. */
  cancelSubscription(subscriptionId: string): Promise<RemoteSubscription>
}

export class BillingProviderError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "BillingProviderError"
    this.status = status
  }
}
