import type {
  Prisma,
  ReleaseChannel,
  ServerStatus,
  SuspensionReason,
} from "@pupitre/db/cloudflare/client"
import { sendServerSuspendedByAdminEmail } from "../../emails/notifications"
import { activeAlertsFor, closeOpenAlerts } from "../alerts/alerts"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import {
  type License,
  licenseForOrganization,
  licenseWindow,
} from "../billing/license"
import { SEATED_STATUSES } from "../billing/seats"
import { type AdminEventView, recentEvents } from "../platform/events"
import { metricsForServer } from "./agent-state"
import type { MetricSample } from "./metrics"
import type { ServerRow } from "./server-row"
import {
  deleteServer,
  type ServerView,
  STALE_AFTER_MS,
  toServerView,
} from "./servers"

export const ADMIN_SERVER_SORTS = [
  "created_at",
  "last_heartbeat_at",
  "name",
] as const

export type AdminServerSort = (typeof ADMIN_SERVER_SORTS)[number]

export interface AdminServerFilter {
  status?: ServerStatus
  organization_id?: string
  q?: string
  stale?: boolean
  sort?: AdminServerSort
  direction?: "asc" | "desc"
  limit: number
  offset: number
}

export interface AdminOrganizationView {
  id: string
  name: string
  slug: string
}

export interface AdminServerView extends ServerView {
  suspended_reason: SuspensionReason | null
  channel: ReleaseChannel
  /** Counted the same way as `ReconcileSeats`. */
  seated: boolean
  organization: AdminOrganizationView
}

export interface AdminServerPage {
  data: AdminServerView[]
  total: number
}

type ServerWithOrganization = ServerRow & {
  organization: AdminOrganizationView
}

export class ServerRevokedError extends Error {
  constructor(serverId: string) {
    super(`server ${serverId} is revoked`)
    this.name = "ServerRevokedError"
  }
}

export class ServerNotAdminSuspendedError extends Error {
  constructor(serverId: string) {
    super(`server ${serverId} was not suspended by the team`)
    this.name = "ServerNotAdminSuspendedError"
  }
}

const ORGANIZATION_SELECT = { select: { id: true, name: true, slug: true } }

function toAdminView(
  server: ServerWithOrganization,
  now: Date,
  alerts: ReturnType<typeof toServerView>["alerts"]
): AdminServerView {
  return {
    ...toServerView(server, now, alerts),
    suspended_reason: server.suspendedReason,
    channel: server.channel,
    seated: SEATED_STATUSES.includes(server.status),
    organization: server.organization,
  }
}

// Must match `isStale`: a machine enrolling or revoked is never stale.
function staleWhere(now: Date): Prisma.ServerWhereInput {
  const threshold = new Date(now.getTime() - STALE_AFTER_MS)

  return {
    status: { notIn: ["enrolling", "revoked"] },
    OR: [
      { lastHeartbeatAt: { lt: threshold } },
      { lastHeartbeatAt: null, createdAt: { lt: threshold } },
    ],
  }
}

function whereOf(
  filter: AdminServerFilter,
  now: Date
): Prisma.ServerWhereInput {
  const q = filter.q?.trim()
  const stale = staleWhere(now)

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.organization_id
      ? { organizationId: filter.organization_id }
      : {}),
    ...(q
      ? { OR: [{ host: { contains: q } }, { name: { contains: q } }] }
      : {}),
    ...(filter.stale === undefined
      ? {}
      : { AND: filter.stale ? [stale] : [{ NOT: stale }] }),
  }
}

function orderOf(
  filter: AdminServerFilter
): Prisma.ServerOrderByWithRelationInput {
  const direction = filter.direction ?? "asc"

  if (filter.sort === "last_heartbeat_at") {
    return { lastHeartbeatAt: direction }
  }

  if (filter.sort === "name") {
    return { name: direction }
  }

  return { createdAt: direction }
}

export async function listServersForPlatform(
  filter: AdminServerFilter
): Promise<AdminServerPage> {
  const prisma = getPrisma()
  const now = new Date()
  const where = whereOf(filter, now)

  const [servers, total] = await Promise.all([
    prisma.server.findMany({
      where,
      orderBy: orderOf(filter),
      skip: filter.offset,
      take: filter.limit,
      include: { organization: ORGANIZATION_SELECT },
    }),
    prisma.server.count({ where }),
  ])

  const alerts = await activeAlertsFor(servers.map((server) => server.id))

  return {
    data: servers.map((server) =>
      toAdminView(server, now, alerts.get(server.id) ?? [])
    ),
    total,
  }
}

export interface AdminActor {
  userId: string
}

/** The row records the team as suspender so a returning subscription does not lift it. */
export async function suspendServerByAdmin(
  actor: AdminActor,
  serverId: string,
  reason: string
): Promise<AdminServerView | null> {
  const prisma = getPrisma()
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { organization: ORGANIZATION_SELECT },
  })

  if (!server) {
    return null
  }

  if (server.status === "revoked") {
    throw new ServerRevokedError(server.id)
  }

  await prisma.server.update({
    where: { id: server.id },
    data: {
      status: "suspended",
      suspendedReason: "admin",
      suspendedByOrganization: false,
    },
  })

  await recordEvent({
    action: "server.suspended",
    actorUserId: actor.userId,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      reason,
      host: server.host,
      name: server.name,
      previous_status: server.status,
    },
  })
  await sendServerSuspendedByAdminEmail({ server, reason })

  const suspended = await prisma.server.findUniqueOrThrow({
    where: { id: server.id },
    include: { organization: ORGANIZATION_SELECT },
  })
  const alerts = await activeAlertsFor([suspended.id])

  return toAdminView(suspended, new Date(), alerts.get(suspended.id) ?? [])
}

export interface AdminServerAssignee {
  id: string
  email: string
  name: string
}

export interface AdminServerDevice {
  id: string
  name: string
  last_used_at: Date | null
  user: { id: string; email: string }
}

export interface AdminServerRevokedDevice {
  device: AdminServerDevice
  revoked_by: AdminServerAssignee | null
  revoked_at: Date
}

export interface AdminServerDetail extends AdminServerView {
  enrollment_expires_at: Date | null
  assigned_user: AdminServerAssignee | null
  device: AdminServerDevice | null
  revoked_devices: AdminServerRevokedDevice[]
  metrics: MetricSample[]
  events: AdminEventView[]
}

const DEVICE_SELECT = {
  select: {
    id: true,
    name: true,
    lastUsedAt: true,
    user: { select: { id: true, email: true } },
  },
} as const

const DETAIL_INCLUDE = {
  organization: ORGANIZATION_SELECT,
  assignedUser: { select: { id: true, email: true, name: true } },
  device: DEVICE_SELECT,
  revokedDevices: {
    orderBy: { revokedAt: "desc" },
    include: { device: DEVICE_SELECT },
  },
} as const

type ServerDetailRow = Prisma.ServerGetPayload<{
  include: typeof DETAIL_INCLUDE
}>

type DeviceRow = ServerDetailRow["device"]

function toDeviceView(device: NonNullable<DeviceRow>): AdminServerDevice {
  return {
    id: device.id,
    name: device.name,
    last_used_at: device.lastUsedAt,
    user: device.user,
  }
}

// `ServerRevokedDevice` stores only the actor id; the console shows a person.
async function revocationActorsOf(
  revocations: ServerDetailRow["revokedDevices"]
): Promise<Map<string, AdminServerAssignee>> {
  const ids = [
    ...new Set(
      revocations
        .map((revocation) => revocation.revokedByUserId)
        .filter((id): id is string => id !== null)
    ),
  ]

  if (ids.length === 0) {
    return new Map()
  }

  const users = await getPrisma().user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, name: true },
  })

  return new Map(users.map((user) => [user.id, user]))
}

async function detailOf(server: ServerDetailRow): Promise<AdminServerDetail> {
  const [alerts, events, actors, metrics] = await Promise.all([
    activeAlertsFor([server.id]),
    recentEvents({ targetType: "server", targetId: server.id }),
    revocationActorsOf(server.revokedDevices),
    metricsForServer(server.id),
  ])

  return {
    ...toAdminView(server, new Date(), alerts.get(server.id) ?? []),
    enrollment_expires_at: server.enrollmentExpiresAt,
    assigned_user: server.assignedUser,
    device: server.device ? toDeviceView(server.device) : null,
    revoked_devices: server.revokedDevices.map((revocation) => ({
      device: toDeviceView(revocation.device),
      revoked_by: revocation.revokedByUserId
        ? (actors.get(revocation.revokedByUserId) ?? null)
        : null,
      revoked_at: revocation.revokedAt,
    })),
    metrics,
    events,
  }
}

export async function readServerForPlatform(
  serverId: string
): Promise<AdminServerDetail | null> {
  const server = await getPrisma().server.findUnique({
    where: { id: serverId },
    include: DETAIL_INCLUDE,
  })

  return server ? await detailOf(server) : null
}

export async function setServerChannel(
  actor: AdminActor,
  serverId: string,
  channel: ReleaseChannel
): Promise<AdminServerDetail | null> {
  const prisma = getPrisma()
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      channel: true,
      name: true,
      host: true,
    },
  })

  if (!server) {
    return null
  }

  if (server.status === "revoked") {
    throw new ServerRevokedError(server.id)
  }

  if (server.channel !== channel) {
    await prisma.server.update({ where: { id: server.id }, data: { channel } })
    await recordEvent({
      action: "server.updated",
      actorUserId: actor.userId,
      organizationId: server.organizationId,
      targetType: "server",
      targetId: server.id,
      payload: {
        channel,
        previous_channel: server.channel,
        host: server.host,
        name: server.name,
      },
    })
  }

  return await readServerForPlatform(server.id)
}

/** A condition that still holds reopens its alert at the next run. */
export async function clearServerAlertsByAdmin(
  actor: AdminActor,
  serverId: string,
  now: Date = new Date()
): Promise<number | null> {
  const server = await getPrisma().server.findUnique({
    where: { id: serverId },
    select: { id: true, organizationId: true, name: true, host: true },
  })

  if (!server) {
    return null
  }

  const closed = await closeOpenAlerts(server.id, now)

  if (closed.length === 0) {
    return 0
  }

  await recordEvent({
    action: "server.alerts_cleared",
    actorUserId: actor.userId,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      cleared: closed.length,
      kinds: closed,
      host: server.host,
      name: server.name,
    },
  })

  return closed.length
}

/** Lifts only a team suspension, into what the organization's licence allows now. */
export async function restoreServerByAdmin(
  actor: AdminActor,
  serverId: string,
  now: Date = new Date()
): Promise<AdminServerDetail | null> {
  const prisma = getPrisma()
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      suspendedReason: true,
    },
  })

  if (!server) {
    return null
  }

  if (!(server.status === "suspended" && server.suspendedReason === "admin")) {
    throw new ServerNotAdminSuspendedError(server.id)
  }

  const held = await licenseForOrganization(server.organizationId, now)

  await prisma.server.update({
    where: { id: server.id },
    data: standingAfterRestore(held, now),
  })

  await recordEvent({
    action: "server.restored",
    actorUserId: actor.userId,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: { license: held.state },
  })

  return await readServerForPlatform(server.id)
}

export type AdminServerDeletion =
  | { deletion: "revoked"; server: AdminServerDetail }
  | { deletion: "purged" }

export async function deleteServerByAdmin(
  actor: AdminActor,
  serverId: string,
  reason: string
): Promise<AdminServerDeletion | null> {
  const server = await getPrisma().server.findUnique({
    where: { id: serverId },
  })

  if (!server) {
    return null
  }

  const deletion = await deleteServer(
    { userId: actor.userId, source: "console" },
    server,
    { by_platform: true, reason }
  )

  if (deletion === "purged") {
    return { deletion }
  }

  const revoked = await getPrisma().server.findUniqueOrThrow({
    where: { id: server.id },
    include: DETAIL_INCLUDE,
  })

  return { deletion, server: await detailOf(revoked) }
}

function standingAfterRestore(held: License, now: Date) {
  if (held.state === "valid") {
    return {
      status: "active" as const,
      suspendedReason: null,
      licenseValidUntil: licenseWindow(now),
    }
  }

  if (held.state === "grace") {
    return {
      status: "grace" as const,
      suspendedReason: null,
      licenseValidUntil: held.valid_until,
    }
  }

  return {
    status: "suspended" as const,
    suspendedReason: "billing" as const,
    licenseValidUntil: held.valid_until,
  }
}
