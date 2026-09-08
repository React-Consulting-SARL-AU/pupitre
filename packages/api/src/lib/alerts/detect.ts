import type { AlertKind, ServerStatus } from "@pupitre/db/cloudflare/client"
import { compareVersions, latestBy } from "@pupitre/shared/semver"

export const UNREACHABLE_AFTER_MS = 1_800_000

export const DISK_ALERT_PERCENT = 90

export const OUTDATED_AFTER_VERSIONS = 2

const WATCHED_STATUSES = new Set<ServerStatus>(["active", "grace"])

export interface AlertState {
  status: ServerStatus
  createdAt: Date
  lastHeartbeatAt: Date | null
  disk: number | null
  agentVersion: string | null
  publishedVersions: string[]
}

export function isWatched(state: AlertState): boolean {
  return WATCHED_STATUSES.has(state.status)
}

export function isUnreachable(state: AlertState, now: Date): boolean {
  if (!isWatched(state)) {
    return false
  }

  const last = state.lastHeartbeatAt ?? state.createdAt

  return now.getTime() - last.getTime() > UNREACHABLE_AFTER_MS
}

export function isDiskHigh(state: AlertState): boolean {
  return (
    isWatched(state) && state.disk !== null && state.disk > DISK_ALERT_PERCENT
  )
}

export function versionsBehind(state: AlertState): number {
  const current = state.agentVersion

  if (!current) {
    return 0
  }

  return state.publishedVersions.filter(
    (version) => compareVersions(version, current) > 0
  ).length
}

export function isAgentOutdated(state: AlertState): boolean {
  return isWatched(state) && versionsBehind(state) >= OUTDATED_AFTER_VERSIONS
}

export function isEntitlementGrace(state: AlertState): boolean {
  return state.status === "grace"
}

export function latestVersionOf(versions: string[]): string | null {
  return latestBy(versions, (version) => version)
}

export function detectAlerts(state: AlertState, now: Date): AlertKind[] {
  const verdicts: [AlertKind, boolean][] = [
    ["server_unreachable", isUnreachable(state, now)],
    ["disk_high", isDiskHigh(state)],
    ["agent_outdated", isAgentOutdated(state)],
    ["entitlement_grace", isEntitlementGrace(state)],
  ]

  return verdicts.filter(([, raised]) => raised).map(([kind]) => kind)
}
