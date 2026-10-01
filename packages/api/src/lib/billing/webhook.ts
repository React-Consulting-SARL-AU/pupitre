import type { BillingInterval } from "@pupitre/db/cloudflare/client"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { type AuditAction, recordEvent } from "../audit/audit"
import { stripeEventLeaseMsFromEnv } from "./config"
import { applyOrganizationLicense, mirrorSubscription } from "./mirror"
import type { RemoteSubscription } from "./provider"
import {
  assertBillingOn,
  getBillingProvider,
  getWebhookSecret,
} from "./runtime"
import { type SignatureRefusal, verifyStripeSignature } from "./signature"
import { type StripeSubscriptionPayload, toRemoteSubscription } from "./stripe"

export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number]

const SUBSCRIPTION_EVENT_PREFIX = "customer.subscription."

export class StripeSignatureInvalidError extends Error {
  readonly refusal: SignatureRefusal

  constructor(refusal: SignatureRefusal) {
    super(`the Stripe signature is ${refusal}`)
    this.name = "StripeSignatureInvalidError"
    this.refusal = refusal
  }
}

export class StripeEventMalformedError extends Error {
  constructor() {
    super("this payload is not a Stripe event")
    this.name = "StripeEventMalformedError"
  }
}

export class StripeEventInFlightError extends Error {
  constructor(eventId: string) {
    super(`the Stripe event ${eventId} is being processed by another delivery`)
    this.name = "StripeEventInFlightError"
  }
}

export interface StripeWebhookResult {
  event_id: string
  type: string
  handled: boolean
  duplicate: boolean
}

interface StripeEventEnvelope {
  id?: unknown
  type?: unknown
  data?: { object?: Record<string, unknown> }
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

// Stripe's 2025 API moved the field under `parent.subscription_details` but older shapes still arrive.
function invoiceSubscriptionOf(object: Record<string, unknown>): string | null {
  const parent = object.parent as Record<string, unknown> | undefined
  const details = parent?.subscription_details as
    | Record<string, unknown>
    | undefined

  return (
    idOf(object.subscription) ??
    idOf(details?.subscription) ??
    idOf(parent?.subscription)
  )
}

function metadataOrganizationOf(
  object: Record<string, unknown>
): string | null {
  const metadata = object.metadata

  if (metadata && typeof metadata === "object") {
    const value = (metadata as Record<string, unknown>).organization_id

    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  const reference = object.client_reference_id

  return typeof reference === "string" && reference.length > 0
    ? reference
    : null
}

async function organizationOfCustomer(
  customerId: string | null
): Promise<string | null> {
  if (!customerId) {
    return null
  }

  const billing = await getPrisma().organizationBilling.findUnique({
    where: { stripeCustomerId: customerId },
    select: { organizationId: true },
  })

  return billing?.organizationId ?? null
}

async function organizationOfSubscription(
  subscriptionId: string | null
): Promise<string | null> {
  if (!subscriptionId) {
    return null
  }

  const mirrored = await getPrisma().subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { organizationId: true },
  })

  return mirrored?.organizationId ?? null
}

async function rememberCustomer(
  organizationId: string,
  customerId: string | null,
  interval: BillingInterval | null
): Promise<void> {
  if (!customerId) {
    return
  }

  const defaultInterval = interval ?? undefined

  await getPrisma().organizationBilling.upsert({
    where: { organizationId },
    create: {
      organizationId,
      stripeCustomerId: customerId,
      defaultInterval,
    },
    update: { stripeCustomerId: customerId, defaultInterval },
  })
}

async function auditSubscription(
  action: AuditAction,
  organizationId: string,
  remote: RemoteSubscription
): Promise<void> {
  await recordEvent({
    action,
    actorUserId: null,
    organizationId,
    targetType: "subscription",
    targetId: remote.id,
    payload: {
      status: remote.status,
      quantity: remote.quantity,
      product: remote.product,
      current_period_end: remote.current_period_end?.toISOString() ?? null,
    },
  })
}

async function onCheckoutCompleted(
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  const organizationId = metadataOrganizationOf(object)
  const customerId = idOf(object.customer)
  const subscriptionId = idOf(object.subscription)

  if (!organizationId) {
    return false
  }

  if (!subscriptionId) {
    await rememberCustomer(organizationId, customerId, null)

    return Boolean(customerId)
  }

  const remote = await getBillingProvider().retrieveSubscription(subscriptionId)

  await rememberCustomer(
    organizationId,
    customerId ?? remote.customer_id,
    remote.interval
  )

  const action = await mirrorSubscription(organizationId, remote)

  await auditSubscription(action, organizationId, remote)

  await applyOrganizationLicense(organizationId, now)

  return true
}

async function organizationOf(
  announced: RemoteSubscription
): Promise<string | null> {
  return (
    announced.organization_id ??
    (await organizationOfCustomer(announced.customer_id)) ??
    (await organizationOfSubscription(announced.id))
  )
}

// The mirror takes Stripe's current answer, so a late event never revives or overrides a newer state.
async function followSubscription(
  organizationId: string,
  subscriptionId: string,
  now: Date
): Promise<void> {
  const remote = await getBillingProvider().retrieveSubscription(subscriptionId)

  await rememberCustomer(organizationId, remote.customer_id, remote.interval)

  const action = await mirrorSubscription(organizationId, remote)

  await auditSubscription(
    remote.status === "canceled" ? "subscription.canceled" : action,
    organizationId,
    remote
  )

  await applyOrganizationLicense(organizationId, now)
}

async function onSubscriptionEvent(
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  const announced = toRemoteSubscription(object as StripeSubscriptionPayload)
  const organizationId = await organizationOf(announced)

  if (!organizationId) {
    return false
  }

  await followSubscription(organizationId, announced.id, now)

  return true
}

async function onInvoicePaymentFailed(
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  const subscriptionId = invoiceSubscriptionOf(object)

  if (!subscriptionId) {
    return false
  }

  const organizationId =
    (await organizationOfSubscription(subscriptionId)) ??
    (await organizationOfCustomer(idOf(object.customer)))

  if (!organizationId) {
    return false
  }

  await followSubscription(organizationId, subscriptionId, now)

  return true
}

// The event row keeps no payload, so this is what a later reader filters on.
function announcedSubscriptionOf(
  type: string,
  object: Record<string, unknown>
): string | null {
  if (type.startsWith(SUBSCRIPTION_EVENT_PREFIX)) {
    return idOf(object.id)
  }

  return invoiceSubscriptionOf(object)
}

function dispatch(
  type: string,
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  if (type === "checkout.session.completed") {
    return onCheckoutCompleted(object, now)
  }

  if (type.startsWith(SUBSCRIPTION_EVENT_PREFIX)) {
    return onSubscriptionEvent(object, now)
  }

  if (type === "invoice.payment_failed") {
    return onInvoicePaymentFailed(object, now)
  }

  return Promise.resolve(false)
}

type Claim = "claimed" | "processed" | "in_flight"

// Racing deliveries collapse on the primary key; a failed or lease-expired claim is retaken on Stripe's retry.
async function claimEvent(
  id: string,
  type: string,
  subscriptionId: string | null,
  now: Date
): Promise<Claim> {
  const prisma = getPrisma()

  try {
    await prisma.stripeEvent.create({
      data: { id, type, subscriptionId, status: "processing", receivedAt: now },
    })

    return "claimed"
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
  }

  const leaseExpiredBefore = new Date(
    now.getTime() - stripeEventLeaseMsFromEnv()
  )

  const retried = await prisma.stripeEvent.updateMany({
    where: {
      id,
      OR: [
        { status: "failed" },
        { status: "processing", receivedAt: { lt: leaseExpiredBefore } },
      ],
    },
    data: { status: "processing", subscriptionId, receivedAt: now },
  })

  if (retried.count === 1) {
    return "claimed"
  }

  const stored = await prisma.stripeEvent.findUnique({
    where: { id },
    select: { status: true },
  })

  return stored?.status === "processed" ? "processed" : "in_flight"
}

export interface StripeWebhookInput {
  payload: string
  signature: string | null
  now?: Date
}

export async function handleStripeWebhook({
  payload,
  signature,
  now = new Date(),
}: StripeWebhookInput): Promise<StripeWebhookResult> {
  assertBillingOn()

  const verdict = await verifyStripeSignature({
    payload,
    header: signature,
    secret: getWebhookSecret(),
    now,
  })

  if (!verdict.valid) {
    throw new StripeSignatureInvalidError(verdict.refusal ?? "mismatch")
  }

  let envelope: StripeEventEnvelope

  try {
    envelope = JSON.parse(payload) as StripeEventEnvelope
  } catch {
    throw new StripeEventMalformedError()
  }

  const id = typeof envelope.id === "string" ? envelope.id : null
  const type = typeof envelope.type === "string" ? envelope.type : null

  if (!(id && type)) {
    throw new StripeEventMalformedError()
  }

  const object = envelope.data?.object ?? {}

  const claim = await claimEvent(
    id,
    type,
    announcedSubscriptionOf(type, object),
    now
  )

  if (claim === "in_flight") {
    throw new StripeEventInFlightError(id)
  }

  if (claim === "processed") {
    return { event_id: id, type, handled: false, duplicate: true }
  }

  const prisma = getPrisma()
  let handled: boolean

  try {
    handled = await dispatch(type, object, now)
  } catch (error) {
    await prisma.stripeEvent.update({
      where: { id },
      data: { status: "failed" },
    })

    throw error
  }

  await prisma.stripeEvent.update({
    where: { id },
    data: { status: "processed", processedAt: now },
  })

  return { event_id: id, type, handled, duplicate: false }
}
