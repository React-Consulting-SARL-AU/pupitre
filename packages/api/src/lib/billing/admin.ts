import type { Subscription } from "@pupitre/db/cloudflare/client"
import {
  GRANTED_PRODUCT,
  isPlatformProduct,
  LIVE_SUBSCRIPTION_STATUSES,
} from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import {
  cancelEndedSubscriptions,
  cancelEndedSubscriptionsBatch,
} from "./expiry"
import { restoreOrganizationServers, suspendExpiredGrace } from "./grace"
import { applyOrganizationLicense, mirrorSubscription } from "./mirror"
import type { RemoteSubscription } from "./provider"
import { assertBillingOn, getBillingProvider } from "./runtime"
import { assertSeatsCoverUsage } from "./seats"
import { liveSubscriptionOf } from "./subscription"

export interface PlatformBillingActor {
  userId: string
}

export interface GrantInput {
  seats: number
  ends_at?: Date | null
  note?: string | null
}

export interface GrantedResize {
  seats?: number
  ends_at?: Date | null
}

export class SubscriptionLiveError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} is still live`)
    this.name = "SubscriptionLiveError"
  }
}

export class PlatformOrganizationError extends Error {
  constructor() {
    super("the platform organization is licensed by what it is")
    this.name = "PlatformOrganizationError"
  }
}

export class SubscriptionNotGrantedError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} was not granted by the team`)
    this.name = "SubscriptionNotGrantedError"
  }
}

export class SubscriptionAlreadyCanceledError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} is already canceled`)
    this.name = "SubscriptionAlreadyCanceledError"
  }
}

export class SubscriptionNotResumableError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} was not cancelled at period end`)
    this.name = "SubscriptionNotResumableError"
  }
}

function isLive(subscription: Subscription): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
}

export function grantedSubscriptionId(): string {
  return `granted_${crypto.randomUUID().replaceAll("-", "")}`
}

export async function grantSubscription(
  actor: PlatformBillingActor,
  organizationId: string,
  input: GrantInput,
  now: Date = new Date()
): Promise<Subscription | null> {
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    throw new PlatformOrganizationError()
  }

  const prisma = getPrisma()
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  })

  if (!organization) {
    return null
  }

  const live = await liveSubscriptionOf(organizationId)

  if (live && isLive(live)) {
    throw new SubscriptionLiveError(live.id)
  }

  const subscription = await prisma.subscription.create({
    data: {
      organizationId,
      stripeSubscriptionId: grantedSubscriptionId(),
      product: GRANTED_PRODUCT,
      status: "active",
      quantity: input.seats,
      currentPeriodEnd: input.ends_at ?? null,
      note: input.note ?? null,
    },
  })

  await recordEvent({
    action: "subscription.granted",
    actorUserId: actor.userId,
    organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      seats: input.seats,
      ends_at: input.ends_at?.toISOString() ?? null,
      note: input.note ?? null,
    },
  })

  await restoreOrganizationServers(organizationId, now)

  return subscription
}

export async function resizeGrantedSubscription(
  actor: PlatformBillingActor,
  subscriptionId: string,
  input: GrantedResize
): Promise<Subscription | null> {
  const prisma = getPrisma()
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    return null
  }

  if (subscription.product !== GRANTED_PRODUCT) {
    throw new SubscriptionNotGrantedError(subscription.id)
  }

  if (input.seats !== undefined) {
    await assertSeatsCoverUsage(subscription.organizationId, input.seats)
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      ...(input.seats === undefined ? {} : { quantity: input.seats }),
      ...(input.ends_at === undefined
        ? {}
        : { currentPeriodEnd: input.ends_at }),
    },
  })

  await recordEvent({
    action: "subscription.updated",
    actorUserId: actor.userId,
    organizationId: subscription.organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      quantity: updated.quantity,
      previous: subscription.quantity,
      current_period_end: updated.currentPeriodEnd?.toISOString() ?? null,
    },
  })

  return updated
}

async function stopSubscription(
  subscription: Subscription,
  now: Date
): Promise<Subscription> {
  const prisma = getPrisma()

  if (isPlatformProduct(subscription.product)) {
    return await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "canceled", currentPeriodEnd: now },
    })
  }

  assertBillingOn()

  const remote = await getBillingProvider().cancelSubscription(
    subscription.stripeSubscriptionId
  )

  await mirrorSubscription(subscription.organizationId, remote)

  return await prisma.subscription.findUniqueOrThrow({
    where: { id: subscription.id },
  })
}

/** Stripe cancels first so billing stops and the webhook that follows finds the mirror in place. */
export async function cancelSubscriptionByAdmin(
  actor: PlatformBillingActor,
  subscriptionId: string,
  reason: string,
  now: Date = new Date()
): Promise<Subscription | null> {
  const subscription = await getPrisma().subscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    return null
  }

  if (subscription.status === "canceled") {
    throw new SubscriptionAlreadyCanceledError(subscription.id)
  }

  const canceled = await stopSubscription(subscription, now)

  await recordEvent({
    action: "subscription.canceled",
    actorUserId: actor.userId,
    organizationId: subscription.organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      reason,
      status: canceled.status,
      quantity: canceled.quantity,
      product: canceled.product,
      previous_status: subscription.status,
      current_period_end: canceled.currentPeriodEnd?.toISOString() ?? null,
    },
  })

  await applyOrganizationLicense(subscription.organizationId, now)
  await suspendExpiredGrace(now)

  return canceled
}

async function mirroredAfter(
  subscription: Subscription,
  remote: RemoteSubscription,
  now: Date
): Promise<Subscription> {
  await mirrorSubscription(subscription.organizationId, remote)
  await applyOrganizationLicense(subscription.organizationId, now)

  return await getPrisma().subscription.findUniqueOrThrow({
    where: { id: subscription.id },
  })
}

/** Servers are left alone: a pending cancellation never stopped them. */
export async function resumeSubscriptionByAdmin(
  actor: PlatformBillingActor,
  subscriptionId: string,
  now: Date = new Date()
): Promise<Subscription | null> {
  const subscription = await getPrisma().subscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    return null
  }

  assertBillingOn()

  if (
    isPlatformProduct(subscription.product) ||
    !(subscription.cancelAtPeriodEnd && isLive(subscription))
  ) {
    throw new SubscriptionNotResumableError(subscription.id)
  }

  const remote = await getBillingProvider().resumeSubscription(
    subscription.stripeSubscriptionId
  )

  const resumed = await mirroredAfter(subscription, remote, now)

  await recordEvent({
    action: "subscription.updated",
    actorUserId: actor.userId,
    organizationId: subscription.organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      status: resumed.status,
      cancel_at_period_end: resumed.cancelAtPeriodEnd,
      previous_cancel_at_period_end: subscription.cancelAtPeriodEnd,
      current_period_end: resumed.currentPeriodEnd?.toISOString() ?? null,
    },
  })

  return resumed
}

export async function deleteSubscriptionByAdmin(
  actor: PlatformBillingActor,
  subscriptionId: string,
  now: Date = new Date()
): Promise<boolean> {
  const prisma = getPrisma()
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    return false
  }

  if (!isPlatformProduct(subscription.product) && isLive(subscription)) {
    throw new SubscriptionLiveError(subscription.id)
  }

  const live = await liveSubscriptionOf(subscription.organizationId)

  await prisma.subscription.delete({ where: { id: subscription.id } })

  await recordEvent({
    action: "subscription.deleted",
    actorUserId: actor.userId,
    organizationId: subscription.organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      status: subscription.status,
      quantity: subscription.quantity,
      product: subscription.product,
      current_period_end: subscription.currentPeriodEnd?.toISOString() ?? null,
    },
  })

  if (live?.id === subscription.id) {
    await applyOrganizationLicense(subscription.organizationId, now)
    await suspendExpiredGrace(now)
  }

  return true
}

const ENDED_GRANT_FILTER = { product: GRANTED_PRODUCT, status: "active" }

export function expireGrantedSubscriptionsBatch(
  now: Date = new Date()
): Promise<string[]> {
  return cancelEndedSubscriptionsBatch(ENDED_GRANT_FILTER, now)
}

export function expireGrantedSubscriptions(
  now: Date = new Date()
): Promise<string[]> {
  return cancelEndedSubscriptions(ENDED_GRANT_FILTER, now)
}
