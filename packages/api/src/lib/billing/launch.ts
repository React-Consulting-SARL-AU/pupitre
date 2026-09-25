import type { Subscription } from "@pupitre/db/cloudflare/client"
import {
  LAUNCH_PRODUCT,
  LAUNCH_SEATS,
  LIVE_SUBSCRIPTION_STATUSES,
} from "@pupitre/shared/plans"
import {
  type CursorBatch,
  D1_BATCH_SIZE,
  drainBatches,
  walkBatches,
} from "../api/batches"
import { getPrisma, isUniqueViolation } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { LaunchNotConfiguredError } from "./config"
import {
  cancelEndedSubscriptions,
  cancelEndedSubscriptionsBatch,
} from "./expiry"
import { restoreOrganizationServers } from "./grace"
import { getBillingMode } from "./runtime"
import { liveSubscriptionOf } from "./subscription"

/** Every organization of a batch is looked up in one `in` list. */
export const LAUNCH_BATCH_SIZE = D1_BATCH_SIZE

export interface LaunchActor {
  organizationId: string
  userId: string
}

export interface LaunchReconciliation {
  aligned: string[]
  /** Launch rows kept for good: the organization enrolled a machine while it was free. */
  kept: string[]
  canceled: string[]
}

export class LaunchSubscriptionEndedError extends Error {
  constructor() {
    super("this organization's launch subscription has ended")
    this.name = "LaunchSubscriptionEndedError"
  }
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

// Null when a racing grant won the unique constraint, so only one journals a creation.
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

/** A launch row that ended or was stopped is never granted again from the console. */
export async function grantLaunchSubscription(
  actor: LaunchActor,
  now: Date = new Date()
): Promise<Subscription> {
  const { organizationId } = actor
  const live = await liveSubscriptionOf(organizationId)

  if (live && LIVE_SUBSCRIPTION_STATUSES.includes(live.status)) {
    return live
  }

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

  if (!created) {
    const existing = await getPrisma().subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId },
    })

    if (!LIVE_SUBSCRIPTION_STATUSES.includes(existing.status)) {
      throw new LaunchSubscriptionEndedError()
    }

    return existing
  }

  await recordEvent({
    action: "subscription.created",
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

  return created
}

export async function alignLaunchBatch(): Promise<string[]> {
  const { mode, launchEndsAt } = getBillingMode()

  if (mode !== "launch" || !launchEndsAt) {
    return []
  }

  const aligned = await getPrisma().subscription.updateManyAndReturn({
    where: {
      product: LAUNCH_PRODUCT,
      status: "trialing",
      OR: [
        { currentPeriodEnd: null },
        { currentPeriodEnd: { not: launchEndsAt } },
      ],
    },
    data: { currentPeriodEnd: launchEndsAt },
    limit: LAUNCH_BATCH_SIZE,
    select: { id: true },
  })

  return aligned.map((subscription) => subscription.id)
}

function earliestByOrganization(
  rows: { organizationId: string | null; _min: { createdAt: Date | null } }[]
): Map<string, Date> {
  const earliest = new Map<string, Date>()

  for (const row of rows) {
    if (row.organizationId && row._min.createdAt) {
      earliest.set(row.organizationId, row._min.createdAt)
    }
  }

  return earliest
}

// A removed server only survives as `server.exchanged` in the journal, which outlives the row.
async function firstExchangeOf(
  organizationIds: string[]
): Promise<Map<string, Date>> {
  const prisma = getPrisma()
  const [servers, journaled] = await Promise.all([
    prisma.server.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: organizationIds },
        serverTokenHash: { not: null },
        status: { not: "enrolling" },
      },
      _min: { createdAt: true },
    }),
    prisma.event.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: organizationIds },
        action: "server.exchanged",
      },
      _min: { createdAt: true },
    }),
  ])

  const first = earliestByOrganization(servers)

  for (const [organizationId, at] of earliestByOrganization(journaled)) {
    const known = first.get(organizationId)

    if (!known || at < known) {
      first.set(organizationId, at)
    }
  }

  return first
}

export interface LaunchSeatBatch extends CursorBatch {
  kept: string[]
}

/** The terms promise a seat for good to an organization that enrolled a machine during the launch. */
export async function keepLaunchSeatsBatch(
  after: string | null,
  now: Date = new Date()
): Promise<LaunchSeatBatch> {
  const prisma = getPrisma()
  const ended = await prisma.subscription.findMany({
    where: {
      product: LAUNCH_PRODUCT,
      status: "trialing",
      currentPeriodEnd: { lte: now },
      ...(after === null ? {} : { id: { gt: after } }),
    },
    orderBy: { id: "asc" },
    take: LAUNCH_BATCH_SIZE,
  })

  if (ended.length === 0) {
    return { kept: [], next: null }
  }

  const organizationIds = [...new Set(ended.map((row) => row.organizationId))]
  const firstExchange = await firstExchangeOf(organizationIds)
  const keeping = ended.filter((subscription) => {
    const exchangedAt = firstExchange.get(subscription.organizationId)

    return (
      exchangedAt !== undefined &&
      subscription.currentPeriodEnd !== null &&
      exchangedAt <= subscription.currentPeriodEnd
    )
  })
  const next =
    ended.length < LAUNCH_BATCH_SIZE ? null : (ended.at(-1)?.id ?? null)

  if (keeping.length === 0) {
    return { kept: [], next }
  }

  await prisma.subscription.updateMany({
    where: {
      id: { in: keeping.map((subscription) => subscription.id) },
      status: "trialing",
    },
    data: { status: "active", currentPeriodEnd: null },
  })

  for (const subscription of keeping) {
    await recordEvent({
      action: "subscription.updated",
      actorUserId: null,
      organizationId: subscription.organizationId,
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
  }

  return { kept: keeping.map((subscription) => subscription.id), next }
}

export const ENDED_LAUNCH_FILTER = {
  product: LAUNCH_PRODUCT,
  status: "trialing",
} as const

export function cancelEndedLaunchBatch(
  now: Date = new Date()
): Promise<string[]> {
  return cancelEndedSubscriptionsBatch(ENDED_LAUNCH_FILTER, now)
}

/** Every seat is kept before anything is cancelled. */
export async function reconcileLaunch(
  now: Date = new Date()
): Promise<LaunchReconciliation> {
  const aligned = await drainBatches(LAUNCH_BATCH_SIZE, alignLaunchBatch)
  const seats = await walkBatches((after) => keepLaunchSeatsBatch(after, now))
  const canceled = await cancelEndedSubscriptions(ENDED_LAUNCH_FILTER, now)

  return { aligned, kept: seats.flatMap((batch) => batch.kept), canceled }
}
