import type { Server, ServerStatus } from "@pupitre/db/cloudflare/client"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { metricsOf } from "./agent-state"
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
  last_heartbeat_at: Date | null
  entitlement_valid_until: Date | null
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

function toView(server: Server, now: Date): ServerView {
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
    last_heartbeat_at: server.lastHeartbeatAt,
    entitlement_valid_until: server.entitlementValidUntil,
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

export async function listServersForOrganization(
  organizationId: string
): Promise<ServerView[]> {
  const servers = await withOrganization(
    getPrisma(),
    organizationId
  ).server.findMany({ orderBy: { createdAt: "asc" } })
  const now = new Date()

  return servers.map((server) => toView(server, now))
}

export async function getServerForOrganization(
  organizationId: string,
  serverId: string
): Promise<ServerDetail | null> {
  const prisma = withOrganization(getPrisma(), organizationId)
  const server = await prisma.server.findFirst({ where: { id: serverId } })

  if (!server) {
    return null
  }

  const events = await prisma.event.findMany({
    where: { targetType: "server", targetId: server.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return {
    ...toView(server, new Date()),
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
  serverId: string
): Promise<boolean> {
  const prisma = withOrganization(getPrisma(), actor.organizationId)
  const server = await prisma.server.findFirst({ where: { id: serverId } })

  if (!server) {
    return false
  }

  await prisma.server.updateMany({
    where: { id: server.id },
    data: {
      status: "revoked",
      assignedUserId: null,
      enrollmentTokenHash: null,
      enrollmentExpiresAt: null,
      decommissionAt: decommissionDeadline(),
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

  return true
}
