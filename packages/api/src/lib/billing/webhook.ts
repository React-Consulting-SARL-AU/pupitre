import type { BillingInterval } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import { type AuditAction, recordEvent } from "../audit/audit"
import { graceDeadline } from "./entitlement"
import { graceOrganizationServers, restoreOrganizationServers } from "./grace"
import type { RemoteSubscription } from "./provider"
import { getBillingProvider, getWebhookSecret } from "./runtime"
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

const LIVE_STATUSES = new Set(["active", "trialing"])

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

async function mirrorSubscription(
  organizationId: string,
  remote: RemoteSubscription,
  status: string
): Promise<AuditAction> {
  const prisma = getPrisma()
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: remote.id },
    select: { id: true },
  })
  const data = {
    product: remote.product,
    quantity: remote.quantity,
    status,
    currentPeriodEnd: remote.current_period_end,
  }

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: remote.id },
    create: { organizationId, stripeSubscriptionId: remote.id, ...data },
    update: data,
  })

  return existing ? "subscription.updated" : "subscription.created"
}

async function auditSubscription(
  action: AuditAction,
  organizationId: string,
  remote: RemoteSubscription,
  status: string
): Promise<void> {
  await recordEvent({
    action,
    actorUserId: null,
    organizationId,
    targetType: "subscription",
    targetId: remote.id,
    payload: {
      status,
      quantity: remote.quantity,
      product: remote.product,
      current_period_end: remote.current_period_end?.toISOString() ?? null,
    },
  })
}

async function onCheckoutCompleted(
  object: Record<string, unknown>
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

  const action = await mirrorSubscription(organizationId, remote, remote.status)

  await auditSubscription(action, organizationId, remote, remote.status)

  if (LIVE_STATUSES.has(remote.status)) {
    await restoreOrganizationServers(organizationId)
  }

  return true
}

async function onSubscriptionChanged(
  object: Record<string, unknown>
): Promise<boolean> {
  const remote = toRemoteSubscription(object as StripeSubscriptionPayload)
  const organizationId =
    remote.organization_id ??
    (await organizationOfCustomer(remote.customer_id)) ??
    (await organizationOfSubscription(remote.id))

  if (!organizationId) {
    return false
  }

  await rememberCustomer(organizationId, remote.customer_id, remote.interval)

  const action = await mirrorSubscription(organizationId, remote, remote.status)

  await auditSubscription(action, organizationId, remote, remote.status)

  if (LIVE_STATUSES.has(remote.status)) {
    await restoreOrganizationServers(organizationId)
  }

  return true
}

async function onSubscriptionDeleted(
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  const remote = toRemoteSubscription(object as StripeSubscriptionPayload)
  const organizationId =
    remote.organization_id ??
    (await organizationOfCustomer(remote.customer_id)) ??
    (await organizationOfSubscription(remote.id))

  if (!organizationId) {
    return false
  }

  await mirrorSubscription(organizationId, remote, "canceled")
  await graceOrganizationServers(
    organizationId,
    remote.current_period_end ?? graceDeadline(now)
  )
  await auditSubscription(
    "subscription.canceled",
    organizationId,
    remote,
    "canceled"
  )

  return true
}

async function onInvoicePaymentFailed(
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  const customerId = idOf(object.customer)
  const subscriptionId =
    idOf(object.subscription) ??
    idOf((object.parent as Record<string, unknown> | undefined)?.subscription)
  const organizationId =
    (await organizationOfSubscription(subscriptionId)) ??
    (await organizationOfCustomer(customerId))

  if (!organizationId) {
    return false
  }

  const prisma = getPrisma()

  if (subscriptionId) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: { status: "past_due" },
    })
  }

  await graceOrganizationServers(organizationId, graceDeadline(now))
  await recordEvent({
    action: "subscription.updated",
    actorUserId: null,
    organizationId,
    targetType: "subscription",
    targetId: subscriptionId ?? customerId ?? organizationId,
    payload: { status: "past_due", reason: "invoice.payment_failed" },
  })

  return true
}

function dispatch(
  type: string,
  object: Record<string, unknown>,
  now: Date
): Promise<boolean> {
  if (type === "checkout.session.completed") {
    return onCheckoutCompleted(object)
  }

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated"
  ) {
    return onSubscriptionChanged(object)
  }

  if (type === "customer.subscription.deleted") {
    return onSubscriptionDeleted(object, now)
  }

  if (type === "invoice.payment_failed") {
    return onInvoicePaymentFailed(object, now)
  }

  return Promise.resolve(false)
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

  const prisma = getPrisma()
  const seen = await prisma.stripeEvent.findUnique({ where: { id } })

  if (seen) {
    return { event_id: id, type, handled: false, duplicate: true }
  }

  const handled = await dispatch(type, envelope.data?.object ?? {}, now)

  await prisma.stripeEvent.create({ data: { id, type, processedAt: now } })

  return { event_id: id, type, handled, duplicate: false }
}
