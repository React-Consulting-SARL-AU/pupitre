import type { Server, ServerStatus } from "@pupitre/db/cloudflare/client"
import type { OrgRole } from "@pupitre/shared/permissions"
import { sendServerDecommissionEmail } from "../../emails/notifications"
import { type AlertView, activeAlertsFor } from "../alerts/alerts"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { metricsOf } from "./agent-state"
import { settleAssignment, settleAssignments } from "./assign"
import { authorizedKeysForUser } from "./authorized-keys"
import { decommissionDeadline } from "./expire"
import type { MetricSample } from "./metrics"
import { hashServerToken, isServerToken } from "./tokens"

export const STALE_AFTER_MS = 86_400_000

export interface ServerForUser {
  id: string
  name: string
  host: string | null
  port: number
  user: string
  host_fingerprint: string | null
  status: ServerStatus
  key_ready: boolean
}

export interface ServerUsage {
  at: string
  disk: number
  ram: number
  load: number
}

export interface ServerView {
  id: string
  name: string
  host: string | null
  port: number
  user: string
  arch: string
  status: ServerStatus
  stale: boolean
  agent_version: string | null
  target_version: string | null
  host_fingerprint: string | null
  assigned_user_id: string | null
  pending_assignment_email: string | null
  last_heartbeat_at: Date | null
  entitlement_valid_until: Date | null
  usage: ServerUsage | null
  alerts: AlertView[]
  created_at: Date
}

export interface ServerEventView {
  id: string
  action: string
  actor_user_id: string | null
  payload: unknown
  created_at: Date
}

export interface ServerDetail extends ServerView {
  metrics: MetricSample[]
  events: ServerEventView[]
}

export function isStale(server: Server, now: Date = new Date()): boolean {
  if (server.status === "enrolling" || server.status === "revoked") {
    return false
  }

  const last = server.lastHeartbeatAt ?? server.createdAt

  return now.getTime() - last.getTime() > STALE_AFTER_MS
}

function lastUsage(server: Server): ServerUsage | null {
  const samples = metricsOf(server)
  const last = samples.at(-1)

  return last
    ? { at: last.at, disk: last.disk, ram: last.ram, load: last.load }
    : null
}

export function toServerView(
  server: Server,
  now: Date = new Date(),
  alerts: AlertView[] = []
): ServerView {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    user: server.sshUser,
    arch: server.arch,
    status: server.status,
    stale: isStale(server, now),
    agent_version: server.agentVersion,
    target_version: server.targetVersion,
    host_fingerprint: server.hostFingerprint,
    assigned_user_id: server.assignedUserId,
    pending_assignment_email: server.pendingAssignmentEmail,
    last_heartbeat_at: server.lastHeartbeatAt,
    entitlement_valid_until: server.entitlementValidUntil,
    usage: lastUsage(server),
    alerts,
    created_at: server.createdAt,
  }
}

export async function findServerByToken(token: string): Promise<Server | null> {
  if (!isServerToken(token)) {
    return null
  }

  const serverTokenHash = await hashServerToken(token)

  return await getPrisma().server.findUnique({ where: { serverTokenHash } })
}

export async function listServersForUser(
  userId: string
): Promise<ServerForUser[]> {
  const prisma = getPrisma()
  const [servers, keys] = await Promise.all([
    prisma.server.findMany({
      where: { assignedUserId: userId },
      orderBy: { createdAt: "asc" },
    }),
    authorizedKeysForUser(prisma, userId),
  ])
  const keyReady = keys.length > 0

  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    user: server.sshUser,
    host_fingerprint: server.hostFingerprint,
    status: server.status,
    key_ready: keyReady,
  }))
}

export interface Viewer {
  userId: string
  role: OrgRole
}

function seesEveryServer(viewer: Viewer): boolean {
  return viewer.role !== "member"
}

export async function listServersForOrganization(
  organizationId: string,
  viewer: Viewer
): Promise<ServerView[]> {
  const found = await withOrganization(
    getPrisma(),
    organizationId
  ).server.findMany({ orderBy: { createdAt: "asc" } })
  const servers = await settleAssignments(found)
  const now = new Date()
  const visible = seesEveryServer(viewer)
    ? servers
    : servers.filter((server) => server.assignedUserId === viewer.userId)
  const alerts = await activeAlertsFor(visible.map((server) => server.id))

  return visible.map((server) =>
    toServerView(server, now, alerts.get(server.id) ?? [])
  )
}

export async function getServerForOrganization(
  organizationId: string,
  serverId: string,
  viewer: Viewer
): Promise<ServerDetail | null> {
  const prisma = withOrganization(getPrisma(), organizationId)
  const found = await prisma.server.findFirst({ where: { id: serverId } })

  if (!found) {
    return null
  }

  const server = await settleAssignment(found)

  if (!(seesEveryServer(viewer) || server.assignedUserId === viewer.userId)) {
    return null
  }

  const [events, alerts] = await Promise.all([
    prisma.event.findMany({
      where: { targetType: "server", targetId: server.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    activeAlertsFor([server.id]),
  ])

  return {
    ...toServerView(server, new Date(), alerts.get(server.id) ?? []),
    metrics: metricsOf(server),
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      actor_user_id: event.actorUserId,
      payload: event.payload,
      created_at: event.createdAt,
    })),
  }
}

export async function deleteServerForOrganization(
  actor: { userId: string; organizationId: string },
  serverId: string,
  acceptLanguage: string | null = null
): Promise<boolean> {
  const prisma = withOrganization(getPrisma(), actor.organizationId)
  const server = await prisma.server.findFirst({ where: { id: serverId } })

  if (!server) {
    return false
  }

  const decommissionAt = decommissionDeadline()

  await prisma.server.updateMany({
    where: { id: server.id },
    data: {
      status: "revoked",
      assignedUserId: null,
      pendingAssignmentEmail: null,
      enrollmentTokenHash: null,
      enrollmentExpiresAt: null,
      decommissionAt,
    },
  })

  await recordEvent({
    action: "server.deleted",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: { host: server.host, name: server.name },
  })

  await sendServerDecommissionEmail({
    server,
    deadline: decommissionAt,
    acceptLanguage,
  })

  return true
}
