import type {
  ServerStatus,
  SuspensionReason,
} from "@pupitre/db/cloudflare/client"
import { sendServerSuspendedByAdminEmail } from "../../emails/notifications"
import { activeAlertsFor } from "../alerts/alerts"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import type { ServerRow } from "./server-row"
import { WITHOUT_METRICS } from "./server-row"
import { type ServerView, toServerView } from "./servers"

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
