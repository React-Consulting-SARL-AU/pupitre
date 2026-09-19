import type {
  Prisma,
  ReleaseChannel,
  ServerStatus,
  SuspensionReason,
} from "@pupitre/db/cloudflare/client"
import { sendServerSuspendedByAdminEmail } from "../../emails/notifications"
import { activeAlertsFor } from "../alerts/alerts"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import {
  type Entitlement,
  entitlementForOrganization,
  entitlementWindow,
} from "../billing/entitlement"
import { type AdminEventView, recentEvents } from "../platform/events"
import type { ServerRow } from "./server-row"
import { WITHOUT_METRICS } from "./server-row"
import { deleteServer, type ServerView, toServerView } from "./servers"

export interface AdminServerFilter {
  status?: ServerStatus
  organization_id?: string
  q?: string
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
    super(`server ${serverId} is revoked and cannot be suspended`)
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
    organization: server.organization,
  }
}

function whereOf(filter: AdminServerFilter) {
  const q = filter.q?.trim()

  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.organization_id
      ? { organizationId: filter.organization_id }
      : {}),
    ...(q
      ? { OR: [{ host: { contains: q } }, { name: { contains: q } }] }
      : {}),
  }
}

export async function listServersForPlatform(
  filter: AdminServerFilter
): Promise<AdminServerPage> {
  const prisma = getPrisma()
  const where = whereOf(filter)
  const [servers, total] = await Promise.all([
    prisma.server.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: filter.offset,
      take: filter.limit,
      omit: WITHOUT_METRICS,
      include: { organization: ORGANIZATION_SELECT },
    }),
    prisma.server.count({ where }),
  ])
  const now = new Date()
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

/**
 * The team takes a machine out of use: its keys stop reaching it and the
 * agent reads `suspended` at its next poll. The reason is for the owner and
 * the journal; the row only remembers who suspended, so that a subscription
 * coming back restores nothing the team took away.
 */
export async function suspendServerByAdmin(
  actor: AdminActor,
  serverId: string,
  reason: string
): Promise<AdminServerView | null> {
  const prisma = getPrisma()
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    omit: WITHOUT_METRICS,
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
    data: { status: "suspended", suspendedReason: "admin" },
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
    omit: WITHOUT_METRICS,
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
  user: { id: string; email: string }
}

export interface AdminServerDetail extends AdminServerView {
  channel: ReleaseChannel
  assigned_user: AdminServerAssignee | null
  device: AdminServerDevice | null
  events: AdminEventView[]
}

const DETAIL_INCLUDE = {
  organization: ORGANIZATION_SELECT,
  assignedUser: { select: { id: true, email: true, name: true } },
  device: {
    select: {
      id: true,
      name: true,
      user: { select: { id: true, email: true } },
    },
  },
} as const

type ServerDetailRow = Prisma.ServerGetPayload<{
  include: typeof DETAIL_INCLUDE
  omit: typeof WITHOUT_METRICS
}>

async function detailOf(server: ServerDetailRow): Promise<AdminServerDetail> {
  const [alerts, events] = await Promise.all([
    activeAlertsFor([server.id]),
    recentEvents({ targetType: "server", targetId: server.id }),
  ])

  return {
    ...toAdminView(server, new Date(), alerts.get(server.id) ?? []),
    channel: server.channel,
    assigned_user: server.assignedUser,
    device: server.device,
    events,
  }
}

export async function readServerForPlatform(
  serverId: string
): Promise<AdminServerDetail | null> {
  const server = await getPrisma().server.findUnique({
    where: { id: serverId },
    omit: WITHOUT_METRICS,
    include: DETAIL_INCLUDE,
  })

  return server ? await detailOf(server) : null
}

/**
 * The team gives a machine back.
 *
 * Only a suspension the team itself laid down lifts here, and what it lifts
 * into is whatever the organization is entitled to now: a subscription that
 * lapsed meanwhile leaves the server in tolerance rather than open.
 */
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

  const held = await entitlementForOrganization(server.organizationId, now)

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
    payload: { entitlement: held.state },
  })

  return await readServerForPlatform(server.id)
}

export type AdminServerDeletion =
  | { deletion: "revoked"; server: AdminServerDetail }
  | { deletion: "purged" }

/**
 * The same two steps as the owner's deletion — revoke and schedule, then
 * purge — signed by the team, with the reason in the journal.
 */
export async function deleteServerByAdmin(
  actor: AdminActor,
  serverId: string,
  reason: string
): Promise<AdminServerDeletion | null> {
  const server = await getPrisma().server.findUnique({
    where: { id: serverId },
    omit: WITHOUT_METRICS,
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
    omit: WITHOUT_METRICS,
    include: DETAIL_INCLUDE,
  })

  return { deletion, server: await detailOf(revoked) }
}

function standingAfterRestore(held: Entitlement, now: Date) {
  if (held.state === "valid") {
    return {
      status: "active" as const,
      suspendedReason: null,
      entitlementValidUntil: entitlementWindow(now),
    }
  }

  if (held.state === "grace") {
    return {
      status: "grace" as const,
      suspendedReason: null,
      entitlementValidUntil: held.valid_until,
    }
  }

  return {
    status: "suspended" as const,
    suspendedReason: "billing" as const,
    entitlementValidUntil: held.valid_until,
  }
}
