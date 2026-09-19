import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import type { ServerRow } from "../servers/server-row"
import { liveSubscriptionOf } from "./subscription"

export const ENTITLEMENT_TTL_MS = 86_400_000

export const GRACE_PERIOD_MS = 604_800_000

export type EntitlementState = "valid" | "grace" | "suspended"

export interface Entitlement {
  state: EntitlementState
  valid_until: Date
}

export const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])

export const GRACE_SUBSCRIPTION_STATUSES = new Set(["past_due", "unpaid"])

export function graceDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + GRACE_PERIOD_MS)
}

export function entitlementWindow(from: Date = new Date()): Date {
  return new Date(from.getTime() + ENTITLEMENT_TTL_MS)
}

export type EntitlementRefusal = "entitlement_required" | "server_suspended"

interface SubscriptionMirror {
  organizationId: string
  status: string
  currentPeriodEnd: Date | null
  updatedAt: Date
}

export function subscriptionStateOf(status: string): EntitlementState {
  if (VALID_SUBSCRIPTION_STATUSES.has(status)) {
    return "valid"
  }

  return GRACE_SUBSCRIPTION_STATUSES.has(status) ? "grace" : "suspended"
}

/**
 * The horizon of a tolerance is written on the servers the day it opens, and
 * never pushed back: the organization reads it there, so `/me` and
 * `/agent/state` name the same day.
 */
async function graceHorizonOf(
  subscription: SubscriptionMirror,
  now: Date
): Promise<Date> {
  const earliest = await getPrisma().server.findFirst({
    where: {
      organizationId: subscription.organizationId,
      status: "grace",
      entitlementValidUntil: { not: null },
    },
    orderBy: { entitlementValidUntil: "asc" },
    select: { entitlementValidUntil: true },
  })

  return (
    earliest?.entitlementValidUntil ??
    graceDeadline(
      subscription.updatedAt.getTime() < now.getTime()
        ? subscription.updatedAt
        : now
    )
  )
}

async function entitlementOf(
  subscription: SubscriptionMirror,
  now: Date
): Promise<Entitlement> {
  const state = subscriptionStateOf(subscription.status)

  if (state === "valid") {
    return { state, valid_until: entitlementWindow(now) }
  }

  if (state === "grace") {
    return { state, valid_until: await graceHorizonOf(subscription, now) }
  }

  return { state, valid_until: subscription.currentPeriodEnd ?? now }
}

/** The platform's own organization is entitled by what it is, not by a subscription. */
function isPlatform(organizationId: string): boolean {
  return organizationId === PLATFORM_ORGANIZATION_ID
}

export async function entitlementForOrganization(
  organizationId: string,
  now: Date = new Date()
): Promise<Entitlement> {
  if (isPlatform(organizationId)) {
    return { state: "valid", valid_until: entitlementWindow(now) }
  }

  const subscription = await liveSubscriptionOf(organizationId)

  if (!subscription) {
    return { state: "suspended", valid_until: now }
  }

  return await entitlementOf(subscription, now)
}

export async function entitlementRefusalFor(
  organizationId: string,
  now: Date = new Date()
): Promise<EntitlementRefusal | null> {
  if (isPlatform(organizationId)) {
    return null
  }

  const subscription = await liveSubscriptionOf(organizationId)

  if (!subscription) {
    return "entitlement_required"
  }

  if ((await entitlementOf(subscription, now)).state === "suspended") {
    return "server_suspended"
  }

  return null
}

export async function entitlementForServer(
  server: ServerRow,
  now: Date = new Date()
): Promise<Entitlement> {
  if (server.status === "suspended") {
    return {
      state: "suspended",
      valid_until: server.entitlementValidUntil ?? now,
    }
  }

  if (server.status === "grace") {
    return {
      state: "grace",
      valid_until: server.entitlementValidUntil ?? graceDeadline(now),
    }
  }

  return await entitlementForOrganization(server.organizationId, now)
}
