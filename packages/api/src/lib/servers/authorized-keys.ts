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
    select: { assignedUserId: true, organizationId: true, status: true },
  })

  if (!server?.assignedUserId || server.status === "suspended") {
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

/**
 * `key_ready` sits on each server, so it answers per server: an account owning
 * a key somewhere does not mean this machine will receive it. A server is ready
 * when its assigned member still belongs to its organization and keeps at least
 * one device this server has not revoked — the very keys
 * `authorizedKeysForServer` would hand it.
 */
export async function keyReadyByServer(
  prisma: ApiPrisma,
  userId: string,
  servers: { id: string; organizationId: string }[]
): Promise<Map<string, boolean>> {
  const ready = new Map(servers.map((server) => [server.id, false]))

  if (servers.length === 0) {
    return ready
  }

  const [devices, memberships, revocations] = await Promise.all([
    prisma.device.findMany({ where: { userId }, select: { id: true } }),
    prisma.member.findMany({
      where: {
        userId,
        organizationId: { in: servers.map((server) => server.organizationId) },
      },
      select: { organizationId: true },
    }),
    prisma.serverRevokedDevice.findMany({
      where: { serverId: { in: servers.map((server) => server.id) } },
      select: { serverId: true, deviceId: true },
    }),
  ])

  const joined = new Set(
    memberships.map((membership) => membership.organizationId)
  )
  const withdrawn = new Map<string, Set<string>>()

  for (const revocation of revocations) {
    const known = withdrawn.get(revocation.serverId) ?? new Set<string>()

    known.add(revocation.deviceId)
    withdrawn.set(revocation.serverId, known)
  }

  for (const server of servers) {
    const gone = withdrawn.get(server.id)

    ready.set(
      server.id,
      joined.has(server.organizationId) &&
        devices.some((device) => !gone?.has(device.id))
    )
  }

  return ready
}
