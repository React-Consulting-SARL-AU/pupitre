import type { Alert, AlertKind } from "@pupitre/db/cloudflare/client"
import {
  sendAgentOutdatedEmail,
  sendBackupFailedEmail,
  sendBackupStaleEmail,
  sendDiskHighEmail,
  sendServerGraceEmail,
  sendServerUnreachableEmail,
} from "../../emails/notifications"
import { type CursorBatch, walkBatches } from "../api/batches"
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

/** Servers one step evaluates: their open alerts come back in one `in` list. */
export const ALERT_BATCH_SIZE = 50

/** Emails one step sends: a retry re-sends only those still marked unsent. */
export const ALERT_NOTICE_BATCH_SIZE = 10

export interface AlertBatch extends CursorBatch {
  /** Only the servers whose alerts opened or closed. */
  runs: AlertRun[]
  /** Open alerts still owed their email: just opened, or whose email failed before. */
  pending: string[]
}

type PublishedVersions = (server: ServerRow) => string[]

async function publishedVersionsFor(
  servers: ServerRow[]
): Promise<PublishedVersions> {
  const arches = [...new Set(servers.map((server) => server.arch))]
  const releases = await getPrisma().release.findMany({
    where: { arch: { in: arches } },
    select: { version: true, arch: true, channel: true },
  })

  return (server) => {
    const channels = CHANNEL_SOURCES[server.channel]
    const versions = releases
      .filter(
        (release) =>
          release.arch === server.arch && channels.includes(release.channel)
      )
      .map((release) => release.version)

    return [...new Set(versions)]
  }
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
    deadline: server.licenseValidUntil ?? now,
  })
}

function openAlertsBy(alerts: Alert[]): Map<string, Alert[]> {
  const byServer = new Map<string, Alert[]>()

  for (const alert of alerts) {
    byServer.set(alert.serverId, [
      ...(byServer.get(alert.serverId) ?? []),
      alert,
    ])
  }

  return byServer
}

// One open row per kind and server is the anti-spam rule; emails go apart so a failed one stays owed.
async function evaluateServers(
  servers: ServerRow[],
  now: Date
): Promise<Omit<AlertBatch, "next">> {
  if (servers.length === 0) {
    return { runs: [], pending: [] }
  }

  const prisma = getPrisma()
  const [versionsOf, open] = await Promise.all([
    publishedVersionsFor(servers),
    prisma.alert.findMany({
      where: {
        serverId: { in: servers.map((server) => server.id) },
        resolvedAt: null,
      },
    }),
  ])
  const openByServer = openAlertsBy(open)
  const settledByKind = new Map<AlertKind, string[]>()
  const runs: AlertRun[] = []
  const pending: string[] = []

  for (const server of servers) {
    const raised = detectAlerts(alertStateOf(server, versionsOf(server)), now)
    const mine = openByServer.get(server.id) ?? []
    const openKinds = new Set(mine.map((alert) => alert.kind))
    const opened = raised.filter((kind) => !openKinds.has(kind))
    const settled = mine.filter((alert) => !raised.includes(alert.kind))
    const owed = mine.filter(
      (alert) => raised.includes(alert.kind) && alert.notifiedAt === null
    )

    pending.push(...owed.map((alert) => alert.id))

    for (const alert of settled) {
      settledByKind.set(alert.kind, [
        ...(settledByKind.get(alert.kind) ?? []),
        server.id,
      ])
    }

    for (const kind of opened) {
      const alert = await prisma.alert.create({
        data: { serverId: server.id, kind, firstSeenAt: now },
      })

      pending.push(alert.id)
    }

    if (opened.length > 0 || settled.length > 0) {
      runs.push({
        serverId: server.id,
        opened,
        resolved: settled.map((alert) => alert.kind),
      })
    }
  }

  for (const [kind, serverIds] of settledByKind) {
    await prisma.alert.updateMany({
      where: { serverId: { in: serverIds }, kind, resolvedAt: null },
      data: { resolvedAt: now },
    })
  }

  return { runs, pending }
}

export async function notifyAlert(
  alertId: string,
  now: Date = new Date()
): Promise<boolean> {
  const prisma = getPrisma()
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { server: true },
  })

  if (!alert || alert.resolvedAt || alert.notifiedAt) {
    return false
  }

  const versionsOf = await publishedVersionsFor([alert.server])
  const state = alertStateOf(alert.server, versionsOf(alert.server))
  const notified = await notify(alert.server, alert.kind, state, now)

  if (notified) {
    await prisma.alert.updateMany({
      where: { id: alert.id, notifiedAt: null },
      data: { notifiedAt: now },
    })
  }

  return notified
}

export async function notifyAlerts(
  alertIds: string[],
  now: Date = new Date()
): Promise<string[]> {
  const notified: string[] = []

  for (const alertId of alertIds) {
    if (await notifyAlert(alertId, now)) {
      notified.push(alertId)
    }
  }

  return notified
}

export async function evaluateServerAlerts(
  server: ServerRow,
  now: Date = new Date()
): Promise<AlertVerdict> {
  const { runs, pending } = await evaluateServers([server], now)

  await notifyAlerts(pending, now)

  return { opened: runs[0]?.opened ?? [], resolved: runs[0]?.resolved ?? [] }
}

export async function evaluateAlertsBatch(
  after: string | null,
  now: Date = new Date()
): Promise<AlertBatch> {
  const servers = await getPrisma().server.findMany({
    where: {
      OR: [
        { status: { in: ["active", "grace"] } },
        { alerts: { some: { resolvedAt: null } } },
      ],
      ...(after === null ? {} : { id: { gt: after } }),
    },
    orderBy: { id: "asc" },
    take: ALERT_BATCH_SIZE,
  })
  const evaluated = await evaluateServers(servers, now)
  const next =
    servers.length < ALERT_BATCH_SIZE ? null : (servers.at(-1)?.id ?? null)

  return { ...evaluated, next }
}

export async function evaluateAlerts(
  now: Date = new Date()
): Promise<AlertRun[]> {
  const batches = await walkBatches((after) => evaluateAlertsBatch(after, now))

  await notifyAlerts(
    batches.flatMap((batch) => batch.pending),
    now
  )

  return batches.flatMap((batch) => batch.runs)
}

/** A condition that still holds reopens at the next run and emails again. */
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
