import { sendServerAssignedEmail } from "../../emails/notifications"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { createInvitation, findMemberUserIdByEmail } from "../orgs/members"
import type { ServerRow } from "./server-row"

export interface Actor {
  userId: string
  organizationId: string
  headers: Headers
}

export type AssignInput = { user_id: string } | { invite_email: string }

export class ServerNotFoundError extends Error {}

export class NotAMemberError extends Error {}

export class DeviceNotFoundError extends Error {}

async function findServer(
  organizationId: string,
  serverId: string
): Promise<ServerRow> {
  const server = await withOrganization(
    getPrisma(),
    organizationId
  ).server.findFirst({ where: { id: serverId } })

  if (!server) {
    throw new ServerNotFoundError(serverId)
  }

  return server
}

function reloadServer(
  prisma: ReturnType<typeof withOrganization>,
  serverId: string
): Promise<ServerRow> {
  return prisma.server.findFirstOrThrow({ where: { id: serverId } })
}

async function writeAssignment(
  actor: { userId: string | null; organizationId: string },
  server: ServerRow,
  data: {
    assignedUserId: string | null
    pendingAssignmentEmail: string | null
  },
  payload: Record<string, string | null>
): Promise<ServerRow> {
  const prisma = withOrganization(getPrisma(), actor.organizationId)

  await prisma.server.updateMany({ where: { id: server.id }, data })

  await recordEvent({
    action: "server.assigned",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: { name: server.name, ...payload },
  })

  return await reloadServer(prisma, server.id)
}

async function assignToUser(
  actor: Actor,
  server: ServerRow,
  userId: string
): Promise<ServerRow> {
  const member = await withOrganization(
    getPrisma(),
    actor.organizationId
  ).member.findFirst({ where: { userId }, select: { id: true } })

  if (!member) {
    throw new NotAMemberError(userId)
  }

  const assigned = await writeAssignment(
    actor,
    server,
    { assignedUserId: userId, pendingAssignmentEmail: null },
    { assigned_user_id: userId }
  )

  await sendServerAssignedEmail({
    userId,
    server: assigned,
    acceptLanguage: actor.headers.get("accept-language"),
  })

  return assigned
}

async function assignToEmail(
  actor: Actor,
  server: ServerRow,
  rawEmail: string
): Promise<ServerRow> {
  const email = rawEmail.trim().toLowerCase()
  const existing = await findMemberUserIdByEmail(actor.organizationId, email)

  if (existing) {
    return await assignToUser(actor, server, existing)
  }

  await createInvitation(actor, { email, role: "member" })

  return await writeAssignment(
    actor,
    server,
    { assignedUserId: null, pendingAssignmentEmail: email },
    { pending_assignment_email: email }
  )
}

export async function assignServer(
  actor: Actor,
  serverId: string,
  input: AssignInput
): Promise<ServerRow> {
  const server = await findServer(actor.organizationId, serverId)

  if ("user_id" in input) {
    return await assignToUser(actor, server, input.user_id)
  }

  return await assignToEmail(actor, server, input.invite_email)
}

export async function unassignServer(
  actor: Actor,
  serverId: string
): Promise<ServerRow> {
  const server = await findServer(actor.organizationId, serverId)
  const prisma = withOrganization(getPrisma(), actor.organizationId)

  await prisma.server.updateMany({
    where: { id: server.id },
    data: { assignedUserId: null, pendingAssignmentEmail: null },
  })

  await recordEvent({
    action: "server.unassigned",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      name: server.name,
      assigned_user_id: server.assignedUserId,
      pending_assignment_email: server.pendingAssignmentEmail,
    },
  })

  return await reloadServer(prisma, server.id)
}

export interface PlatformUnassignment {
  actorUserId: string
  reason: string
}

/** Otherwise a later invitation would hand the keys back without anyone asking. */
export async function unassignServersOfMember(
  organizationId: string,
  userId: string,
  byPlatform: PlatformUnassignment | null = null
): Promise<string[]> {
  const prisma = withOrganization(getPrisma(), organizationId)
  const held = await prisma.server.findMany({
    where: { assignedUserId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })

  if (held.length === 0) {
    return []
  }

  await prisma.server.updateMany({
    where: { id: { in: held.map((server) => server.id) } },
    data: { assignedUserId: null },
  })

  for (const server of held) {
    await recordEvent({
      action: "server.unassigned",
      actorUserId: byPlatform?.actorUserId ?? null,
      organizationId,
      targetType: "server",
      targetId: server.id,
      payload: {
        name: server.name,
        assigned_user_id: userId,
        via: "member_removed",
        ...(byPlatform ? { by_platform: true, reason: byPlatform.reason } : {}),
      },
    })
  }

  return held.map((server) => server.id)
}

export async function revokeDeviceOnServer(
  actor: Actor,
  serverId: string,
  deviceId: string
): Promise<void> {
  const server = await findServer(actor.organizationId, serverId)
  const prisma = getPrisma()
  const device = await prisma.device.findFirst({
    where: {
      id: deviceId,
      user: { members: { some: { organizationId: actor.organizationId } } },
    },
    select: { id: true, name: true },
  })

  if (!device) {
    throw new DeviceNotFoundError(deviceId)
  }

  await prisma.serverRevokedDevice.upsert({
    where: { serverId_deviceId: { serverId: server.id, deviceId: device.id } },
    create: {
      serverId: server.id,
      deviceId: device.id,
      revokedByUserId: actor.userId,
    },
    update: { revokedByUserId: actor.userId, revokedAt: new Date() },
  })

  await recordEvent({
    action: "server.device_revoked",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: { device_id: device.id, device_name: device.name },
  })
}

// Concurrent polls can settle the same invitation; the conditional write picks the one that journals and emails.
async function claimAssignment(
  prisma: ReturnType<typeof withOrganization>,
  server: ServerRow,
  userId: string
): Promise<ServerRow> {
  const { count } = await prisma.server.updateMany({
    where: {
      id: server.id,
      assignedUserId: null,
      pendingAssignmentEmail: server.pendingAssignmentEmail,
    },
    data: { assignedUserId: userId, pendingAssignmentEmail: null },
  })

  if (count !== 1) {
    return await reloadServer(prisma, server.id)
  }

  await recordEvent({
    action: "server.assigned",
    actorUserId: null,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      name: server.name,
      assigned_user_id: userId,
      via: "invitation_accepted",
    },
  })

  const settled = await reloadServer(prisma, server.id)

  await sendServerAssignedEmail({ userId, server: settled })

  return settled
}

export async function settleAssignment(server: ServerRow): Promise<ServerRow> {
  if (server.assignedUserId || !server.pendingAssignmentEmail) {
    return server
  }

  const userId = await findMemberUserIdByEmail(
    server.organizationId,
    server.pendingAssignmentEmail
  )

  if (!userId) {
    return server
  }

  return await claimAssignment(
    withOrganization(getPrisma(), server.organizationId),
    server,
    userId
  )
}

// Callers pass one organization's servers, so one scoped query covers every pending email.
async function memberUserIdsByEmail(
  prisma: ReturnType<typeof withOrganization>,
  emails: string[]
): Promise<Map<string, string>> {
  const members = await prisma.member.findMany({
    select: { userId: true, user: { select: { email: true } } },
  })

  return new Map(
    members
      .map(
        (member) =>
          [member.user.email.trim().toLowerCase(), member.userId] as const
      )
      .filter(([email]) => emails.includes(email))
  )
}

export async function settleAssignments(
  servers: ServerRow[]
): Promise<ServerRow[]> {
  const waiting = servers.filter(
    (server): server is ServerRow & { pendingAssignmentEmail: string } =>
      !server.assignedUserId && server.pendingAssignmentEmail !== null
  )
  const [first] = waiting

  if (!first) {
    return servers
  }

  const emails = [
    ...new Set(
      waiting.map((server) => server.pendingAssignmentEmail.toLowerCase())
    ),
  ]

  const prisma = withOrganization(getPrisma(), first.organizationId)
  const userIds = await memberUserIdsByEmail(prisma, emails)

  return await Promise.all(
    servers.map(async (server) => {
      const email = server.pendingAssignmentEmail?.trim().toLowerCase()
      const userId = email ? userIds.get(email) : undefined

      return userId && !server.assignedUserId
        ? await claimAssignment(prisma, server, userId)
        : server
    })
  )
}
