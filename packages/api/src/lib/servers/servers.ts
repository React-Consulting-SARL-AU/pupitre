import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import type { BackupBeat } from "@pupitre/shared/backup"
import type { OrgRole } from "@pupitre/shared/permissions"
import { sendServerDecommissionEmail } from "../../emails/notifications"
import { type AlertView, activeAlertsFor } from "../alerts/alerts"
import { getPrisma, withOrganization } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import { readBackupBeat } from "../backups/beat"
import { metricsForServer } from "./agent-state"
import { settleAssignment, settleAssignments } from "./assign"
import { keyReadyByServer } from "./authorized-keys"
import { RELEASED_ENROLLMENT } from "./enrollment-key"
import { decommissionDeadline } from "./expire"
import { type MetricSample, readUsage, type ServerUsage } from "./metrics"
import type { ServerRow } from "./server-row"
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
  organization: { id: string; name: string }
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
  decommission_at: Date | null
  usage: ServerUsage | null
  backup: BackupBeat | null
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

export function isStale(server: ServerRow, now: Date = new Date()): boolean {
  if (server.status === "enrolling" || server.status === "revoked") {
    return false
  }

  const last = server.lastHeartbeatAt ?? server.createdAt

  return now.getTime() - last.getTime() > STALE_AFTER_MS
}

export function toServerView(
  server: ServerRow,
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
    decommission_at: server.decommissionAt,
    usage: readUsage(server.lastUsage),
    backup: readBackupBeat(server.backup),
    alerts,
    created_at: server.createdAt,
  }
}

export async function findServerByToken(
  token: string
): Promise<ServerRow | null> {
  if (!isServerToken(token)) {
    return null
  }

  const serverTokenHash = await hashServerToken(token)

  return await getPrisma().server.findUnique({
    where: { serverTokenHash },
  })
}

export async function listServersForUser(
  userId: string
): Promise<ServerForUser[]> {
  const prisma = getPrisma()
  const servers = await prisma.server.findMany({
    where: { assignedUserId: userId, status: { not: "revoked" } },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true } } },
  })

  const keyReady = await keyReadyByServer(prisma, userId, servers)

  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    user: server.sshUser,
    host_fingerprint: server.hostFingerprint,
    status: server.status,
    key_ready: keyReady.get(server.id) ?? false,
    organization: {
      id: server.organization.id,
      name: server.organization.name,
    },
  }))
}

export interface Viewer {
  userId: string
  role: OrgRole
}

export function seesEveryServer(viewer: Viewer): boolean {
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

export async function findVisibleServer(
  organizationId: string,
  serverId: string,
  viewer: Viewer
): Promise<ServerRow | null> {
  const found = await withOrganization(
    getPrisma(),
    organizationId
  ).server.findFirst({ where: { id: serverId } })

  if (!found) {
    return null
  }

  const server = await settleAssignment(found)

  return seesEveryServer(viewer) || server.assignedUserId === viewer.userId
    ? server
    : null
}

export async function getServerForOrganization(
  organizationId: string,
  serverId: string,
  viewer: Viewer
): Promise<ServerDetail | null> {
  const prisma = withOrganization(getPrisma(), organizationId)
  const server = await findVisibleServer(organizationId, serverId, viewer)

  if (!server) {
    return null
  }

  const [events, alerts, metrics] = await Promise.all([
    prisma.event.findMany({
      where: { targetType: "server", targetId: server.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    activeAlertsFor([server.id]),
    metricsForServer(server.id),
  ])

  return {
    ...toServerView(server, new Date(), alerts.get(server.id) ?? []),
    metrics,
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      actor_user_id: event.actorUserId,
      payload: event.payload,
      created_at: event.createdAt,
    })),
  }
}

/** A second deletion purges a revoked server rather than pushing its deadline back. */
export type ServerDeletion = "revoked" | "purged"

export type DeletionOrigin = { by_platform: true; reason: string } | null

export async function deleteServer(
  actor: Actor,
  server: ServerRow,
  origin: DeletionOrigin,
  acceptLanguage: string | null = null
): Promise<ServerDeletion> {
  const prisma = withOrganization(getPrisma(), server.organizationId)
  const payload = { host: server.host, name: server.name, ...origin }

  if (server.status === "revoked") {
    await prisma.server.deleteMany({ where: { id: server.id } })

    await recordEvent({
      action: "server.purged",
      actorUserId: actor.userId,
      organizationId: server.organizationId,
      targetType: "server",
      targetId: server.id,
      payload,
    })

    return "purged"
  }

  const decommissionAt = decommissionDeadline()

  await prisma.server.updateMany({
    where: { id: server.id },
    data: {
      ...RELEASED_ENROLLMENT,
      status: "revoked",
      assignedUserId: null,
      pendingAssignmentEmail: null,
      decommissionAt,
    },
  })

  await recordEvent({
    action: "server.deleted",
    actorUserId: actor.userId,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload,
  })

  await sendServerDecommissionEmail({
    server,
    deadline: decommissionAt,
    acceptLanguage,
  })

  return "revoked"
}

export async function deleteServerForOrganization(
  actor: { userId: string; organizationId: string },
  serverId: string,
  acceptLanguage: string | null = null
): Promise<ServerDeletion | null> {
  const server = await withOrganization(
    getPrisma(),
    actor.organizationId
  ).server.findFirst({ where: { id: serverId } })

  if (!server) {
    return null
  }

  return await deleteServer(
    { userId: actor.userId, source: "console" },
    server,
    null,
    acceptLanguage
  )
}
