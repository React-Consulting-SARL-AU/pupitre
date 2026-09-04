import type { Server } from "@pupitre/db/cloudflare/client"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { sendServerAssignedEmail } from "../emails/assignment"
import { createInvitation, findMemberUserIdByEmail } from "../orgs/members"

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
): Promise<Server> {
  const server = await withOrganization(
    getPrisma(),
    organizationId
  ).server.findFirst({ where: { id: serverId } })

  if (!server) {
    throw new ServerNotFoundError(serverId)
  }

  return server
}

async function writeAssignment(
  actor: { userId: string | null; organizationId: string },
  server: Server,
  data: {
    assignedUserId: string | null
    pendingAssignmentEmail: string | null
  },
  payload: Record<string, string | null>
): Promise<Server> {
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

  return await prisma.server.findFirstOrThrow({ where: { id: server.id } })
}

async function assignToUser(
  actor: Actor,
  server: Server,
  userId: string
): Promise<Server> {
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

  await sendServerAssignedEmail({ userId, server: assigned })

  return assigned
}

async function assignToEmail(
  actor: Actor,
  server: Server,
  rawEmail: string
): Promise<Server> {
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
): Promise<Server> {
  const server = await findServer(actor.organizationId, serverId)

  if ("user_id" in input) {
    return await assignToUser(actor, server, input.user_id)
  }

  return await assignToEmail(actor, server, input.invite_email)
}

export async function unassignServer(
  actor: Actor,
  serverId: string
): Promise<Server> {
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

  return await prisma.server.findFirstOrThrow({ where: { id: server.id } })
}

export async function revokeDeviceOnServer(
  actor: Actor,
  serverId: string,
  deviceId: string
): Promise<void> {
  const server = await findServer(actor.organizationId, serverId)
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
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

export async function settleAssignment(server: Server): Promise<Server> {
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

  const settled = await writeAssignment(
    { userId: null, organizationId: server.organizationId },
    server,
    { assignedUserId: userId, pendingAssignmentEmail: null },
    { assigned_user_id: userId, via: "invitation_accepted" }
  )

  await sendServerAssignedEmail({ userId, server: settled })

  return settled
}

export async function settleAssignments(servers: Server[]): Promise<Server[]> {
  const waiting = servers.some(
    (server) => !server.assignedUserId && server.pendingAssignmentEmail
  )

  if (!waiting) {
    return servers
  }

  const settled: Server[] = []

  for (const server of servers) {
    settled.push(await settleAssignment(server))
  }

  return settled
}
