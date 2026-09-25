import type { ApiPrisma } from "../api/prisma"
import { isBanned } from "../platform/lifecycle"

// Overrides assignment: a banned, closed or departing account holds no key anywhere.
async function accountHoldsKeys(
  prisma: ApiPrisma,
  userId: string,
  now: Date
): Promise<boolean> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      banned: true,
      banExpires: true,
      deactivatedAt: true,
      deletionAt: true,
    },
  })

  if (!account || account.deactivatedAt || account.deletionAt) {
    return false
  }

  return !isBanned(account, now)
}

export interface HeldDevice {
  id: string
  userId: string
  name: string
  publicKey: string
  fingerprint: string
}

async function devicesOfUser(
  prisma: ApiPrisma,
  userId: string,
  excludedDeviceIds: string[]
): Promise<HeldDevice[]> {
  return await prisma.device.findMany({
    where: {
      userId,
      ...(excludedDeviceIds.length > 0
        ? { id: { notIn: excludedDeviceIds } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      name: true,
      publicKey: true,
      fingerprint: true,
    },
  })
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

export async function heldDevicesForServer(
  prisma: ApiPrisma,
  serverId: string,
  now: Date = new Date()
): Promise<HeldDevice[]> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { assignedUserId: true, organizationId: true, status: true },
  })

  if (!server?.assignedUserId || server.status === "suspended") {
    return []
  }

  if (!(await accountHoldsKeys(prisma, server.assignedUserId, now))) {
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

  return await devicesOfUser(prisma, server.assignedUserId, revoked)
}

export async function authorizedKeysForServer(
  prisma: ApiPrisma,
  serverId: string,
  now: Date = new Date()
): Promise<string[]> {
  const devices = await heldDevicesForServer(prisma, serverId, now)

  return devices.map((device) => device.publicKey)
}

/** Per server, and must agree with the keys `authorizedKeysForServer` would hand each one. */
export async function keyReadyByServer(
  prisma: ApiPrisma,
  userId: string,
  servers: { id: string; organizationId: string }[],
  now: Date = new Date()
): Promise<Map<string, boolean>> {
  const ready = new Map(servers.map((server) => [server.id, false]))

  if (servers.length === 0 || !(await accountHoldsKeys(prisma, userId, now))) {
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
