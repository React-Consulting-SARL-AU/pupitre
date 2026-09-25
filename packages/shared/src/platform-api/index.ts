import { z } from "zod"

/** Where the platform serves its API under its origin: the console's, the app's and the agent's calls all start here. */
export const PLATFORM_API_PATH = "/api/v1"

/** What `/agent/state` grants a server; not the agent's own vocabulary, which `hello` speaks. */
const SERVER_ENTITLEMENTS = ["valid", "grace", "suspended"] as const

export const ServerEntitlementSchema = z.enum(SERVER_ENTITLEMENTS)

/** What `/me` says of the active organization's usage right; `none` without an active organization. */
export const AccountEntitlementSchema = z.enum(["none", ...SERVER_ENTITLEMENTS])

export type AccountEntitlement = z.infer<typeof AccountEntitlementSchema>

const ENTITLED: readonly string[] = ["valid", "grace"]

/** Grace still lets everything run: only `suspended` and `none` stop a server. */
export function isEntitled(entitlement: string): boolean {
  return ENTITLED.includes(entitlement)
}

export const SERVER_STATUSES = [
  "enrolling",
  "active",
  "grace",
  "suspended",
  "revoked",
] as const

export const ServerStatusSchema = z.enum(SERVER_STATUSES)

export type ServerStatus = z.infer<typeof ServerStatusSchema>

export const ALERT_KINDS = [
  "server_unreachable",
  "disk_high",
  "agent_outdated",
  "entitlement_grace",
  "backup_failed",
  "backup_stale",
] as const

export type AlertKind = (typeof ALERT_KINDS)[number]

/** RFC 3339, as `Date.toISOString` and Go's `time.RFC3339` write it. */
export const InstantSchema = z.iso.datetime({ offset: true })
