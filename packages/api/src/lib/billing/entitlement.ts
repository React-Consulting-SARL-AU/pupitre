import type { Server } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

export const ENTITLEMENT_TTL_MS = 86_400_000

export const GRACE_PERIOD_MS = 604_800_000

export type EntitlementState = "valid" | "grace" | "suspended"

export interface Entitlement {
  state: EntitlementState
  valid_until: Date
}

const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])

const GRACE_SUBSCRIPTION_STATUSES = new Set([
  "past_due",
  "unpaid",
  "incomplete",
])

export function graceDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + GRACE_PERIOD_MS)
}

export function entitlementWindow(from: Date = new Date()): Date {
  return new Date(from.getTime() + ENTITLEMENT_TTL_MS)
}

export async function entitlementForOrganization(
  organizationId: string,
  now: Date = new Date()
): Promise<Entitlement> {
  const subscription = await getPrisma().subscription.findFirst({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  })

  if (!subscription) {
    return { state: "valid", valid_until: entitlementWindow(now) }
  }

  if (VALID_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return { state: "valid", valid_until: entitlementWindow(now) }
  }

  if (GRACE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return {
      state: "grace",
      valid_until: subscription.currentPeriodEnd ?? graceDeadline(now),
    }
  }

  return {
    state: "suspended",
    valid_until: subscription.currentPeriodEnd ?? now,
  }
}

export async function entitlementForServer(
  server: Server,
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
