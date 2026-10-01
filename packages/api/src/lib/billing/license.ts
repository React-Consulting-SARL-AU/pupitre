import { FREE_SERVERS } from "@pupitre/shared/plans"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma, withOrganization } from "../api/prisma"
import type { ServerRow } from "../servers/server-row"
import { countSeatedServers } from "./seats"
import { liveSubscriptionOf } from "./subscription"

export const LICENSE_TTL_MS = 86_400_000

export const GRACE_PERIOD_MS = 604_800_000

export type LicenseState = "valid" | "grace" | "suspended"

export interface License {
  state: LicenseState
  valid_until: Date
}

export const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"])

export const GRACE_SUBSCRIPTION_STATUSES = new Set(["past_due", "unpaid"])

export function graceDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + GRACE_PERIOD_MS)
}

export function licenseWindow(from: Date = new Date()): Date {
  return new Date(from.getTime() + LICENSE_TTL_MS)
}

export type LicenseRefusal = "license_required" | "server_suspended"

export function subscriptionStateOf(status: string): LicenseState {
  if (VALID_SUBSCRIPTION_STATUSES.has(status)) {
    return "valid"
  }

  return GRACE_SUBSCRIPTION_STATUSES.has(status) ? "grace" : "suspended"
}

// Read off the servers, where it is written once and never pushed back, so `/me` and `/agent/state` agree.
async function graceHorizonOf(organizationId: string): Promise<Date | null> {
  const earliest = await getPrisma().server.findFirst({
    where: {
      organizationId,
      status: "grace",
      licenseValidUntil: { not: null },
    },
    orderBy: { licenseValidUntil: "asc" },
    select: { licenseValidUntil: true },
  })

  return earliest?.licenseValidUntil ?? null
}

function isPlatform(organizationId: string): boolean {
  return organizationId === PLATFORM_ORGANIZATION_ID
}

// A suspension or closure by the team outranks any licence.
async function isHeldByPlatform(organizationId: string): Promise<boolean> {
  const organization = await getPrisma().organization.findUnique({
    where: { id: organizationId },
    select: { suspendedAt: true, closedAt: true, deletionAt: true },
  })

  return Boolean(
    organization?.suspendedAt ||
      organization?.closedAt ||
      organization?.deletionAt
  )
}

export async function fitsFreeTier(organizationId: string): Promise<boolean> {
  const seated = await countSeatedServers(
    withOrganization(getPrisma(), organizationId)
  )

  return seated <= FREE_SERVERS
}

// Without a live licence, an organization past the free servers runs out its grace, then stops.
async function unlicensedStateOf(
  organizationId: string,
  now: Date
): Promise<License> {
  if (await fitsFreeTier(organizationId)) {
    return { state: "valid", valid_until: licenseWindow(now) }
  }

  const horizon = await graceHorizonOf(organizationId)

  if (horizon && horizon.getTime() > now.getTime()) {
    return { state: "grace", valid_until: horizon }
  }

  return { state: "suspended", valid_until: now }
}

export async function licenseForOrganization(
  organizationId: string,
  now: Date = new Date()
): Promise<License> {
  if (isPlatform(organizationId)) {
    return { state: "valid", valid_until: licenseWindow(now) }
  }

  if (await isHeldByPlatform(organizationId)) {
    return { state: "suspended", valid_until: now }
  }

  const subscription = await liveSubscriptionOf(organizationId)
  const state = subscription
    ? subscriptionStateOf(subscription.status)
    : "suspended"

  if (state === "valid") {
    return { state, valid_until: licenseWindow(now) }
  }

  if (state === "grace" && subscription) {
    const horizon =
      (await graceHorizonOf(organizationId)) ??
      graceDeadline(
        subscription.updatedAt.getTime() < now.getTime()
          ? subscription.updatedAt
          : now
      )

    return { state, valid_until: horizon }
  }

  return await unlicensedStateOf(organizationId, now)
}

export async function licenseRefusalFor(
  organizationId: string,
  now: Date = new Date()
): Promise<LicenseRefusal | null> {
  if (isPlatform(organizationId)) {
    return null
  }

  if (await isHeldByPlatform(organizationId)) {
    return "server_suspended"
  }

  const license = await licenseForOrganization(organizationId, now)

  return license.state === "suspended" ? "license_required" : null
}

export async function licenseForServer(
  server: ServerRow,
  now: Date = new Date()
): Promise<License> {
  if (server.status === "suspended") {
    return {
      state: "suspended",
      valid_until: server.licenseValidUntil ?? now,
    }
  }

  if (server.status === "grace") {
    return {
      state: "grace",
      valid_until: server.licenseValidUntil ?? graceDeadline(now),
    }
  }

  return await licenseForOrganization(server.organizationId, now)
}
