import type { Alert, AlertKind, Server } from "@pupitre/db/cloudflare/client"
import {
  sendAgentOutdatedEmail,
  sendDiskHighEmail,
  sendServerGraceEmail,
  sendServerUnreachableEmail,
} from "../../emails/notifications"
import { getPrisma } from "../api/prisma"
import { CHANNEL_SOURCES } from "../releases/releases"
import { metricsOf } from "../servers/agent-state"
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

async function publishedVersionsFor(server: Server): Promise<string[]> {
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
  server: Server,
  publishedVersions: string[]
): AlertState {
  const last = metricsOf(server).at(-1)

  return {
    status: server.status,
    createdAt: server.createdAt,
    lastHeartbeatAt: server.lastHeartbeatAt,
    disk: last ? last.disk : null,
    agentVersion: server.agentVersion,
    publishedVersions,
  }
}

function notify(
  server: Server,
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

  return sendServerGraceEmail({
    server,
    deadline: server.entitlementValidUntil ?? now,
  })
}

async function openAlert(
  server: Server,
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
  server: Server,
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
    const verdict = await evaluateServerAlerts(server as unknown as Server, now)

    runs.push({ serverId: server.id, ...verdict })
  }

  return runs
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
