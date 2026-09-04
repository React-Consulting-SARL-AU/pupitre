import type { ApiPrisma } from "../api/prisma"

export async function authorizedKeysForUser(
  prisma: ApiPrisma,
  userId: string
): Promise<string[]> {
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { publicKey: true },
  })

  return devices.map((device) => device.publicKey)
}

export async function authorizedKeysForServer(
  prisma: ApiPrisma,
  serverId: string
): Promise<string[]> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { assignedUserId: true },
  })

  if (!server?.assignedUserId) {
    return []
  }

  return await authorizedKeysForUser(prisma, server.assignedUserId)
}
