import { z } from "zod"

export const PLATFORM_API_PATH = "/api/v1"

// The platform's vocabulary, not the agent's own, which `hello` speaks.
const SERVER_LICENSES = ["valid", "grace", "suspended"] as const

export const ServerLicenseSchema = z.enum(SERVER_LICENSES)

export type ServerLicense = z.infer<typeof ServerLicenseSchema>

// `none` without an active organization.
export const AccountLicenseSchema = z.enum(["none", ...SERVER_LICENSES])

export type AccountLicense = z.infer<typeof AccountLicenseSchema>

// Grace still lets everything run.
const LICENSED: readonly string[] = ["valid", "grace"]

export function isLicensed(license: string): boolean {
  return LICENSED.includes(license)
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

export const ADMIN_SERVER_ACTIONS = [
  "set_channel",
  "clear_alerts",
  "suspend",
  "restore",
  "delete",
] as const

export type AdminServerAction = (typeof ADMIN_SERVER_ACTIONS)[number]

export const ALERT_KINDS = [
  "server_unreachable",
  "disk_high",
  "agent_outdated",
  "license_grace",
  "backup_failed",
  "backup_stale",
] as const

export type AlertKind = (typeof ALERT_KINDS)[number]

// RFC 3339, as `Date.toISOString` and Go's `time.RFC3339` write it.
export const InstantSchema = z.iso.datetime({ offset: true })
