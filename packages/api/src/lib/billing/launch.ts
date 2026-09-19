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

/**
 * Extending the launch is an environment change: every running launch
 * subscription follows the configured end. One that has passed it is
 * cancelled the way any ended subscription of the platform's own is.
 */
export async function reconcileLaunch(
  now: Date = new Date()
): Promise<LaunchReconciliation> {
  const aligned = await alignWithLaunchEnd()
  const canceled = await cancelEndedSubscriptions(
    { product: LAUNCH_PRODUCT, status: "trialing" },
    now
  )

  return { aligned, canceled }
}
