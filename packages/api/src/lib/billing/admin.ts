import type { Subscription } from "@pupitre/db/cloudflare/client"
import { GRANTED_PRODUCT, isPlatformProduct } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { cancelEndedSubscriptions } from "./expiry"
import {
  graceOrganizationServers,
  restoreOrganizationServers,
  suspendExpiredGrace,
} from "./grace"
import { isLaunchMode } from "./launch"
import { applyOrganizationEntitlement, mirrorSubscription } from "./mirror"
import type { RemoteSubscription } from "./provider"
import { getBillingProvider } from "./runtime"
import { assertSeatsCoverUsage } from "./seats"
import { LIVE_SUBSCRIPTION_STATUSES, liveSubscriptionOf } from "./subscription"

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
    super("the platform organization is entitled by what it is")
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

export class SubscriptionNotStripeError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} is a product Stripe never sees`)
    this.name = "SubscriptionNotStripeError"
  }
}

export class SubscriptionNotTrialingError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} is not trialing`)
    this.name = "SubscriptionNotTrialingError"
  }
}

export class SubscriptionNotResumableError extends Error {
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} was not cancelled at period end`)
    this.name = "SubscriptionNotResumableError"
  }
}

export class TrialEndNotFutureError extends Error {
  constructor() {
    super("a trial ends later than now")
    this.name = "TrialEndNotFutureError"
  }
}

export class BillingLaunchModeError extends Error {
  constructor() {
    super("the platform does not call Stripe during the launch")
    this.name = "BillingLaunchModeError"
  }
}

function isLive(subscription: Subscription): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status)
}

/** Every gesture that reaches Stripe: the launch runs without a Stripe key at all. */
function assertStripeReachable(): void {
  if (isLaunchMode()) {
    throw new BillingLaunchModeError()
  }
}

export function grantedSubscriptionId(): string {
  return `granted_${crypto.randomUUID().replaceAll("-", "")}`
}

/**
 * A subscription the team gives, outside Stripe: the seats and the end it
 * chooses. An organization that still has a live subscription keeps it; the
 * team cancels it first.
 */
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

/** What the mirror holds once Stripe, or the row itself, has stopped the subscription. */
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

  const remote = await getBillingProvider().cancelSubscription(
    subscription.stripeSubscriptionId
  )

  await mirrorSubscription(subscription.organizationId, remote)

  return await prisma.subscription.findUniqueOrThrow({
    where: { id: subscription.id },
  })
}

/**
 * The team stops a subscription. A Stripe one is cancelled at Stripe first,
 * so the customer stops being billed, and the webhook that follows finds the
 * mirror already there. The servers then follow what the organization still
 * has, and a tolerance that ends now is closed now.
 */
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
  await applyOrganizationEntitlement(subscription.organizationId, now)
  await suspendExpiredGrace(now)

  return canceled
}

/** The row Stripe just wrote back, read from the mirror the webhook also writes. */
async function mirroredAfter(
  subscription: Subscription,
  remote: RemoteSubscription,
  now: Date
): Promise<Subscription> {
  await mirrorSubscription(subscription.organizationId, remote)
  await applyOrganizationEntitlement(subscription.organizationId, now)

  return await getPrisma().subscription.findUniqueOrThrow({
    where: { id: subscription.id },
  })
}

/**
 * The team gives a trial more time. Stripe holds the trial, so Stripe moves it
 * first and the mirror takes the answer; the webhook that follows finds the
 * row already there.
 */
export async function extendSubscriptionTrial(
  actor: PlatformBillingActor,
  subscriptionId: string,
  endsAt: Date,
  now: Date = new Date()
): Promise<Subscription | null> {
  const subscription = await getPrisma().subscription.findUnique({
    where: { id: subscriptionId },
  })

  if (!subscription) {
    return null
  }

  assertStripeReachable()

  if (isPlatformProduct(subscription.product)) {
    throw new SubscriptionNotStripeError(subscription.id)
  }

  if (subscription.status !== "trialing") {
    throw new SubscriptionNotTrialingError(subscription.id)
  }

  if (endsAt.getTime() <= now.getTime()) {
    throw new TrialEndNotFutureError()
  }

  const remote = await getBillingProvider().extendTrial(
    subscription.stripeSubscriptionId,
    endsAt
  )
  const extended = await mirroredAfter(subscription, remote, now)

  await recordEvent({
    action: "subscription.updated",
    actorUserId: actor.userId,
    organizationId: subscription.organizationId,
    targetType: "subscription",
    targetId: subscription.stripeSubscriptionId,
    payload: {
      status: extended.status,
      trial_ends_at: extended.currentPeriodEnd?.toISOString() ?? null,
      previous_trial_ends_at:
        subscription.currentPeriodEnd?.toISOString() ?? null,
    },
  })

  return extended
}

/**
 * A cancellation waiting for the end of the period is taken back: Stripe keeps
 * billing, and nothing about the servers changes, since they never stopped.
 */
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

  assertStripeReachable()

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

async function followEntitlementAfterLoss(
  organizationId: string,
  now: Date
): Promise<void> {
  const live = await liveSubscriptionOf(organizationId)

  if (live) {
    await applyOrganizationEntitlement(organizationId, now)
  } else {
    await graceOrganizationServers(organizationId, now)
  }

  await suspendExpiredGrace(now)
}

/**
 * Only a row Stripe no longer bills leaves the mirror: the platform's own
 * products in any status, or a Stripe one that is not live. If it was the one
 * that counted for the organization, the servers follow what is left.
 */
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
    await followEntitlementAfterLoss(subscription.organizationId, now)
  }

  return true
}

export function expireGrantedSubscriptions(
  now: Date = new Date()
): Promise<string[]> {
  return cancelEndedSubscriptions(
    { product: GRANTED_PRODUCT, status: "active" },
    now
  )
}
