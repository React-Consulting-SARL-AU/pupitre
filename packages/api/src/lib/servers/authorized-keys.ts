import type { ApiPrisma } from "../api/prisma"

export async function authorizedKeysForUser(
  prisma: ApiPrisma,
  userId: string,
  excludedDeviceIds: string[] = []
): Promise<string[]> {
  const devices = await prisma.device.findMany({
    where: {
      userId,
      ...(excludedDeviceIds.length > 0
        ? { id: { notIn: excludedDeviceIds } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { publicKey: true },
  })

  return devices.map((device) => device.publicKey)
}

export async function revokedDeviceIdsForServer(
  prisma: ApiPrisma,
  serverId: string
): Promise<string[]> {
  const revocations = await prisma.serverRevokedDevice.findMany({
    where: { serverId },
    select: { deviceId: true },
  })

  return revocations.map((revocation) => revocation.deviceId)
}

export async function authorizedKeysForServer(
  prisma: ApiPrisma,
  serverId: string
): Promise<string[]> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { assignedUserId: true, organizationId: true },
  })

  if (!server?.assignedUserId) {
    return []
  }

  const membership = await prisma.member.findFirst({
    where: {
      organizationId: server.organizationId,
      userId: server.assignedUserId,
    },
    select: { id: true },
  })

  if (!membership) {
    return []
  }

  const revoked = await revokedDeviceIdsForServer(prisma, serverId)

  return await authorizedKeysForUser(prisma, server.assignedUserId, revoked)
}
