import type { AlertKind, ServerStatus } from "@pupitre/db/cloudflare/client"
import { type BackupBeat, backupStaleAfterHours } from "@pupitre/shared/backup"
import { compareVersions, latestBy } from "@pupitre/shared/semver"

const HOUR_MS = 3_600_000

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
  backup: BackupBeat | null
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

function timeOf(value: string | undefined): number | null {
  const time = value ? Date.parse(value) : Number.NaN

  return Number.isNaN(time) ? null : time
}

/** A backup that went through without some of its parts is a failure too: what it lacks is what a restore would lose. */
export function isBackupFailed(state: AlertState): boolean {
  const beat = state.backup

  if (!(isWatched(state) && beat)) {
    return false
  }

  if ((beat.last_warnings ?? 0) > 0) {
    return true
  }

  if (!beat.last_error) {
    return false
  }

  const lastRun = timeOf(beat.last_run_at)
  const lastOk = timeOf(beat.last_ok_at)

  return lastRun !== null && (lastOk === null || lastRun > lastOk)
}

/** A server that never succeeded has nothing to be late against: its failures are `backup_failed`. */
export function isBackupStale(state: AlertState, now: Date): boolean {
  const beat = state.backup
  const staleAfter = beat ? backupStaleAfterHours(beat.interval_hours) : null
  const lastOk = timeOf(beat?.last_ok_at)

  if (!isWatched(state) || staleAfter === null || lastOk === null) {
    return false
  }

  return now.getTime() - lastOk > staleAfter * HOUR_MS
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
    ["backup_failed", isBackupFailed(state)],
    ["backup_stale", isBackupStale(state, now)],
  ]

  return verdicts.filter(([, raised]) => raised).map(([kind]) => kind)
}
