import type { Alert, AlertKind } from "@pupitre/db/cloudflare/client"
import {
  sendAgentOutdatedEmail,
  sendBackupFailedEmail,
  sendBackupStaleEmail,
  sendDiskHighEmail,
  sendServerGraceEmail,
  sendServerUnreachableEmail,
} from "../../emails/notifications"
import { getPrisma } from "../api/prisma"
import { readBackupBeat } from "../backups/beat"
import { CHANNEL_SOURCES } from "../releases/releases"
import { readUsage } from "../servers/metrics"
import type { ServerRow } from "../servers/server-row"
import { type AlertState, detectAlerts, latestVersionOf } from "./detect"

export interface AlertView {
  kind: AlertKind
  first_seen_at: Date
  notified_at: Date | null
}

export interface AlertVerdict {
  opened: AlertKind[]
  resolved: AlertKind[]
}

export interface AlertRun extends AlertVerdict {
  serverId: string
}

async function publishedVersionsFor(server: ServerRow): Promise<string[]> {
  const releases = await getPrisma().release.findMany({
    where: {
      arch: server.arch,
      channel: { in: CHANNEL_SOURCES[server.channel] },
    },
    select: { version: true },
  })

  return [...new Set(releases.map((release) => release.version))]
}

export function alertStateOf(
  server: ServerRow,
  publishedVersions: string[]
): AlertState {
  const last = readUsage(server.lastUsage)

  return {
    status: server.status,
    createdAt: server.createdAt,
    lastHeartbeatAt: server.lastHeartbeatAt,
    disk: last ? last.disk : null,
    agentVersion: server.agentVersion,
    publishedVersions,
    backup: readBackupBeat(server.backup),
  }
}

function dateOf(value: string | undefined): Date | null {
  return value ? new Date(value) : null
}

function notify(
  server: ServerRow,
  kind: AlertKind,
  state: AlertState,
  now: Date
): Promise<boolean> {
  if (kind === "server_unreachable") {
    return sendServerUnreachableEmail({
      server,
      lastSeenAt: state.lastHeartbeatAt,
    })
  }

  if (kind === "disk_high") {
    return sendDiskHighEmail({ server, disk: state.disk ?? 0 })
  }

  if (kind === "agent_outdated") {
    return sendAgentOutdatedEmail({
      server,
      latestVersion: latestVersionOf(state.publishedVersions) ?? "—",
    })
  }

  if (kind === "backup_failed") {
    return sendBackupFailedEmail({
      server,
      lastError: state.backup?.last_error ?? null,
      missing: state.backup?.last_warnings ?? 0,
      lastRunAt: dateOf(state.backup?.last_run_at),
    })
  }

  if (kind === "backup_stale") {
    return sendBackupStaleEmail({
      server,
      lastOkAt: dateOf(state.backup?.last_ok_at),
      intervalHours: state.backup?.interval_hours ?? 0,
    })
  }

  return sendServerGraceEmail({
    server,
    deadline: server.entitlementValidUntil ?? now,
  })
}

async function openAlert(
  server: ServerRow,
  kind: AlertKind,
  state: AlertState,
  now: Date
): Promise<void> {
  const prisma = getPrisma()
  const alert = await prisma.alert.create({
    data: { serverId: server.id, kind, firstSeenAt: now },
  })
  const notified = await notify(server, kind, state, now)

  if (notified) {
    await prisma.alert.update({
      where: { id: alert.id },
      data: { notifiedAt: now },
    })
  }
}

/**
 * One open row per kind and per server is the whole anti-spam rule: nothing
 * leaves while an episode is open, and the next email waits for the return to
 * normal that closes it.
 */
export async function evaluateServerAlerts(
  server: ServerRow,
  now: Date = new Date()
): Promise<AlertVerdict> {
  const prisma = getPrisma()
  const state = alertStateOf(server, await publishedVersionsFor(server))
  const raised = detectAlerts(state, now)
  const open = await prisma.alert.findMany({
    where: { serverId: server.id, resolvedAt: null },
  })
  const openKinds = new Set(open.map((alert: Alert) => alert.kind))
  const opened = raised.filter((kind) => !openKinds.has(kind))
  const settled = open.filter((alert: Alert) => !raised.includes(alert.kind))

  if (settled.length > 0) {
    await prisma.alert.updateMany({
      where: { id: { in: settled.map((alert: Alert) => alert.id) } },
      data: { resolvedAt: now },
    })
  }

  for (const kind of opened) {
    await openAlert(server, kind, state, now)
  }

  return { opened, resolved: settled.map((alert: Alert) => alert.kind) }
}

export async function evaluateAlerts(
  now: Date = new Date()
): Promise<AlertRun[]> {
  const servers = await getPrisma().server.findMany({
    where: {
      OR: [
        { status: { in: ["active", "grace"] } },
        { alerts: { some: { resolvedAt: null } } },
      ],
    },
    orderBy: { createdAt: "asc" },
  })
  const runs: AlertRun[] = []

  for (const server of servers) {
    const verdict = await evaluateServerAlerts(server, now)

    runs.push({ serverId: server.id, ...verdict })
  }

  return runs
}

/**
 * Closing by hand is the stroke the hourly run makes on a return to normal. A
 * condition that still holds opens a new episode at the next run, and the
 * email that goes with it leaves again.
 */
export async function closeOpenAlerts(
  serverId: string,
  now: Date = new Date()
): Promise<AlertKind[]> {
  const prisma = getPrisma()
  const open = await prisma.alert.findMany({
    where: { serverId, resolvedAt: null },
    orderBy: { firstSeenAt: "asc" },
    select: { id: true, kind: true },
  })

  if (open.length === 0) {
    return []
  }

  await prisma.alert.updateMany({
    where: { id: { in: open.map((alert) => alert.id) } },
    data: { resolvedAt: now },
  })

  return open.map((alert) => alert.kind)
}

export async function activeAlertsFor(
  serverIds: string[]
): Promise<Map<string, AlertView[]>> {
  const found = new Map<string, AlertView[]>()

  if (serverIds.length === 0) {
    return found
  }

  const alerts = await getPrisma().alert.findMany({
    where: { serverId: { in: serverIds }, resolvedAt: null },
    orderBy: { firstSeenAt: "asc" },
  })

  for (const alert of alerts) {
    const list = found.get(alert.serverId) ?? []

    list.push({
      kind: alert.kind,
      first_seen_at: alert.firstSeenAt,
      notified_at: alert.notifiedAt,
    })
    found.set(alert.serverId, list)
  }

  return found
}
