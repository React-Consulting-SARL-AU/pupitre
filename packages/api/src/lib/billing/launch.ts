import type { Subscription } from "@pupitre/db/cloudflare/client"
import { LAUNCH_PRODUCT, LAUNCH_SEATS } from "@pupitre/shared/plans"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { LaunchNotConfiguredError } from "./config"
import { cancelEndedSubscriptions } from "./expiry"
import { restoreOrganizationServers } from "./grace"
import { getBillingMode } from "./runtime"
import { LIVE_SUBSCRIPTION_STATUSES, liveSubscriptionOf } from "./subscription"

export interface LaunchActor {
  organizationId: string
  userId: string
}

export interface LaunchReconciliation {
  aligned: string[]
  /** The launch rows turned into a seat for good: the organization enrolled a machine while it was free. */
  kept: string[]
  canceled: string[]
}

export function launchSubscriptionId(organizationId: string): string {
  return `launch_${organizationId}`
}

export function isLaunchMode(): boolean {
  return getBillingMode().mode === "launch"
}

function launchEnd(): Date {
  const { mode, launchEndsAt } = getBillingMode()

  if (mode !== "launch" || !launchEndsAt) {
    throw new LaunchNotConfiguredError("BILLING_MODE is not launch")
  }

  return launchEndsAt
}

type LaunchRowData = Pick<
  Subscription,
  "product" | "quantity" | "status" | "currentPeriodEnd"
>

/**
 * The row, when this call is the one that wrote it.
 *
 * Two grants racing each other must not both read the journal as a creation:
 * the unique constraint decides which one created, and the loser updates.
 */
async function createLaunchRow(
  organizationId: string,
  stripeSubscriptionId: string,
  data: LaunchRowData
): Promise<Subscription | null> {
  try {
    return await getPrisma().subscription.create({
      data: { organizationId, stripeSubscriptionId, ...data },
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null
    }

    throw error
  }
}

/**
 * The subscription the platform grants itself while there is no company to
 * bill through: one machine per organization until the launch ends. A live
 * subscription, launch or not, is left alone.
 */
export async function grantLaunchSubscription(
  actor: LaunchActor,
  now: Date = new Date()
): Promise<Subscription> {
  const { organizationId } = actor
  const live = await liveSubscriptionOf(organizationId)

  if (live && LIVE_SUBSCRIPTION_STATUSES.includes(live.status)) {
    return live
  }

  const prisma = getPrisma()
  const stripeSubscriptionId = launchSubscriptionId(organizationId)
  const data = {
    product: LAUNCH_PRODUCT,
    quantity: LAUNCH_SEATS,
    status: "trialing",
    currentPeriodEnd: launchEnd(),
  }
  const created = await createLaunchRow(
    organizationId,
    stripeSubscriptionId,
    data
  )
  const subscription =
    created ??
    (await prisma.subscription.update({
      where: { stripeSubscriptionId },
      data,
    }))

  await recordEvent({
    action: created ? "subscription.created" : "subscription.updated",
    actorUserId: actor.userId,
    organizationId,
    targetType: "subscription",
    targetId: stripeSubscriptionId,
    payload: {
      status: data.status,
      quantity: data.quantity,
      product: data.product,
      current_period_end: data.currentPeriodEnd.toISOString(),
    },
  })
  await restoreOrganizationServers(organizationId, now)

  return subscription
}

async function alignWithLaunchEnd(): Promise<string[]> {
  const { mode, launchEndsAt } = getBillingMode()

  if (mode !== "launch" || !launchEndsAt) {
    return []
  }

  const prisma = getPrisma()
  const drifted = await prisma.subscription.findMany({
    where: {
      product: LAUNCH_PRODUCT,
      status: "trialing",
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { not: launchEndsAt } },
      ],
    },
    select: { id: true },
  })

  if (drifted.length === 0) {
    return []
  }

  const ids = drifted.map((subscription) => subscription.id)

  await prisma.subscription.updateMany({
    where: { id: { in: ids } },
    data: { currentPeriodEnd: launchEndsAt },
  })

  return ids
}

/** A machine that exchanged its token, or did once before being removed: the journal outlives the row. */
async function enrolledAMachine(organizationId: string): Promise<boolean> {
  const prisma = getPrisma()
  const exchanged = await prisma.server.count({
    where: { organizationId, status: { not: "enrolling" } },
  })

  if (exchanged > 0) {
    return true
  }

  const journaled = await prisma.event.count({
    where: { organizationId, action: "server.exchanged" },
  })

  return journaled > 0
}

/**
 * What the terms promise: an organization that enrolled a machine during the
 * free launch keeps one seat for as long as the service exists. Its launch
 * row becomes active without an end, so no expiry ever picks it up. An
 * organization that pays elsewhere keeps that subscription instead, and one
 * that never enrolled anything ends like any other.
 */
async function keepLaunchSeats(now: Date): Promise<string[]> {
  const prisma = getPrisma()
  const ended = await prisma.subscription.findMany({
    where: {
      product: LAUNCH_PRODUCT,
      status: "trialing",
      currentPeriodEnd: { lte: now },
    },
    orderBy: { currentPeriodEnd: "asc" },
  })
  const kept: string[] = []

  for (const subscription of ended) {
    const { organizationId } = subscription

    if (!(await enrolledAMachine(organizationId))) {
      continue
    }

    const live = await liveSubscriptionOf(organizationId)

    if (
      live &&
      live.id !== subscription.id &&
      LIVE_SUBSCRIPTION_STATUSES.includes(live.status)
    ) {
      continue
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "active", currentPeriodEnd: null },
    })
    await recordEvent({
      action: "subscription.updated",
      actorUserId: null,
      organizationId,
      targetType: "subscription",
      targetId: subscription.stripeSubscriptionId,
      payload: {
        status: "active",
        quantity: subscription.quantity,
        product: subscription.product,
        current_period_end: null,
        previous_status: subscription.status,
        launch_seat_kept: true,
      },
    })
    kept.push(subscription.id)
  }

  return kept
}

/**
 * Extending the launch is an environment change: every running launch
 * subscription follows the configured end. One that has passed it stays, for
 * good, with the organization that enrolled a machine, and is cancelled the
 * way any ended subscription of the platform's own is otherwise.
 */
export async function reconcileLaunch(
  now: Date = new Date()
): Promise<LaunchReconciliation> {
  const aligned = await alignWithLaunchEnd()
  const kept = await keepLaunchSeats(now)
  const canceled = await cancelEndedSubscriptions(
    { product: LAUNCH_PRODUCT, status: "trialing" },
    now
  )

  return { aligned, kept, canceled }
}
