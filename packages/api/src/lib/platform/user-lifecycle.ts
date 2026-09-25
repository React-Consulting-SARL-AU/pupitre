import {
  LIVE_SUBSCRIPTION_STATUSES,
  PLATFORM_PRODUCTS,
} from "@pupitre/shared/plans"
import {
  deletionDeadline,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
import { inBatches } from "../api/batches"
import { getApiAuth } from "../api/plugins/auth"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { SEATED_STATUSES } from "../billing/seats"
import { removeDevice } from "../devices/devices"
import { unassignServersOfMember } from "../servers/assign"
import { purgeOrganization } from "./organization-lifecycle"
import {
  type AdminUserDetail,
  belongsToPlatform,
  PlatformMemberProtectedError,
  type PlatformUserActor,
  readUserForPlatform,
  revokeSessions,
} from "./users"

export class UserAlreadyDeactivatedError extends Error {
  constructor(userId: string) {
    super(`user ${userId} is already deactivated`)
    this.name = "UserAlreadyDeactivatedError"
  }
}

export class UserActiveError extends Error {
  constructor(userId: string) {
    super(`user ${userId} has nothing to lift`)
    this.name = "UserActiveError"
  }
}

export class SoleOwnerError extends Error {
  readonly organizationId: string

  constructor(userId: string, organizationId: string) {
    super(`user ${userId} is the sole owner of organization ${organizationId}`)
    this.name = "SoleOwnerError"
    this.organizationId = organizationId
  }
}

export class EmailAlreadyVerifiedError extends Error {
  constructor(userId: string) {
    super(`user ${userId} already verified their address`)
    this.name = "EmailAlreadyVerifiedError"
  }
}

const STANDING_SELECT = {
  id: true,
  email: true,
  emailVerified: true,
  deactivatedAt: true,
  deletionAt: true,
} as const

// Removing every device is what takes the account's keys off the servers.
async function releaseFromMachines(
  actor: PlatformUserActor,
  userId: string,
  reason: string
): Promise<void> {
  const prisma = getPrisma()
  const devices = await prisma.device.findMany({
    where: { userId },
    select: { id: true },
  })

  for (const device of devices) {
    await removeDevice(userId, device.id, {
      actorUserId: actor.userId,
      reason,
    })
  }

  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true },
  })

  for (const membership of memberships) {
    await unassignServersOfMember(membership.organizationId, userId, {
      actorUserId: actor.userId,
      reason,
    })
  }
}

export async function deactivateUserFromPlatform(
  actor: PlatformUserActor,
  userId: string,
  reason: string,
  now: Date = new Date()
): Promise<AdminUserDetail | null> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: STANDING_SELECT,
  })

  if (!user) {
    return null
  }

  if (await belongsToPlatform(userId)) {
    throw new PlatformMemberProtectedError(userId)
  }

  if (user.deactivatedAt) {
    throw new UserAlreadyDeactivatedError(userId)
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deactivatedAt: now,
      deactivatedReason: reason,
      deactivatedByUserId: actor.userId,
    },
  })
  await revokeSessions(userId)
  await releaseFromMachines(actor, userId, reason)
  await recordEvent({
    action: "user.deactivated",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
    payload: { reason },
  })

  return await readUserForPlatform(userId)
}

export async function reactivateUserFromPlatform(
  actor: PlatformUserActor,
  userId: string
): Promise<AdminUserDetail | null> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: STANDING_SELECT,
  })

  if (!user) {
    return null
  }

  if (!(user.deactivatedAt || user.deletionAt)) {
    throw new UserActiveError(userId)
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deactivatedAt: null,
      deactivatedReason: null,
      deactivatedByUserId: null,
      deletionAt: null,
      deletionReason: null,
      deletionByUserId: null,
    },
  })
  await recordEvent({
    action: "user.reactivated",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
    payload: {
      was_deactivated: Boolean(user.deactivatedAt),
      was_deleting: Boolean(user.deletionAt),
    },
  })

  return await readUserForPlatform(userId)
}

async function holdsMachinesOrBilling(
  organizationId: string,
  goesWithAccount: boolean
): Promise<boolean> {
  const prisma = getPrisma()
  const [servers, subscriptions] = await Promise.all([
    prisma.server.count({
      where: { organizationId, status: { in: SEATED_STATUSES } },
    }),
    prisma.subscription.count({
      where: {
        organizationId,
        status: { in: LIVE_SUBSCRIPTION_STATUSES },
        ...(goesWithAccount
          ? { product: { notIn: [...PLATFORM_PRODUCTS] } }
          : {}),
      },
    }),
  ])

  return servers > 0 || subscriptions > 0
}

// A sole-member organization goes with the account, so only a Stripe billing (a deleted row would not stop it) holds it back.
export async function soleOwnerOrganizationOf(
  userId: string
): Promise<string | null> {
  const prisma = getPrisma()
  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true, role: true },
  })

  for (const { organizationId, role } of memberships) {
    const [members, otherOwners] = await Promise.all([
      prisma.member.count({ where: { organizationId } }),
      prisma.member.count({
        where: { organizationId, role: "owner", NOT: { userId } },
      }),
    ])
    const goesWithAccount = members === 1
    const soleOwner = role === "owner" && otherOwners === 0

    if (!(goesWithAccount || soleOwner)) {
      continue
    }

    if (organizationId === PLATFORM_ORGANIZATION_ID) {
      return organizationId
    }

    if (await holdsMachinesOrBilling(organizationId, goesWithAccount)) {
      return organizationId
    }
  }

  return null
}

async function organizationsLeftEmptyBy(userId: string): Promise<string[]> {
  const prisma = getPrisma()
  const memberships = await prisma.member.findMany({
    where: { userId, NOT: { organizationId: PLATFORM_ORGANIZATION_ID } },
    select: { organizationId: true },
  })
  const empty: string[] = []

  for (const { organizationId } of memberships) {
    const others = await prisma.member.count({
      where: { organizationId, NOT: { userId } },
    })

    if (others === 0) {
      empty.push(organizationId)
    }
  }

  return empty
}

async function assertNotSoleOwner(userId: string): Promise<void> {
  const organizationId = await soleOwnerOrganizationOf(userId)

  if (organizationId) {
    throw new SoleOwnerError(userId, organizationId)
  }
}

export type UserDeletion =
  | { deletion: "scheduled"; user: AdminUserDetail }
  | { deletion: "purged" }

export async function deleteUserFromPlatform(
  actor: PlatformUserActor,
  userId: string,
  reason: string,
  now: Date = new Date()
): Promise<UserDeletion | null> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: STANDING_SELECT,
  })

  if (!user) {
    return null
  }

  if (await belongsToPlatform(userId)) {
    throw new PlatformMemberProtectedError(userId)
  }

  await assertNotSoleOwner(userId)

  if (user.deletionAt) {
    await purgeUser(user.id, actor.userId)

    return { deletion: "purged" }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionAt: deletionDeadline(now),
      deletionReason: reason,
      deletionByUserId: actor.userId,
    },
  })
  await revokeSessions(userId)

  if (!user.deactivatedAt) {
    await releaseFromMachines(actor, userId, reason)
  }

  await recordEvent({
    action: "user.deleted",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
    payload: { reason, purge_at: deletionDeadline(now).toISOString() },
  })

  const scheduled = await readUserForPlatform(userId)

  return scheduled ? { deletion: "scheduled", user: scheduled } : null
}

// Lines about the account and its devices go; its lines elsewhere only lose their author.
async function forgetUserInJournal(userId: string): Promise<void> {
  const prisma = getPrisma()
  const [devices, deviceEvents] = await Promise.all([
    prisma.device.findMany({ where: { userId }, select: { id: true } }),
    prisma.event.findMany({
      where: { actorUserId: userId, targetType: "device" },
      select: { targetId: true },
    }),
  ])
  const deviceIds = [
    ...new Set([
      ...devices.map((device) => device.id),
      ...deviceEvents.map((event) => event.targetId),
    ]),
  ]

  await prisma.event.deleteMany({
    where: { targetType: "user", targetId: userId },
  })

  for (const batch of inBatches(deviceIds)) {
    await prisma.event.deleteMany({
      where: { targetType: "device", targetId: { in: batch } },
    })
  }
}

export async function purgeUser(
  userId: string,
  actorUserId: string | null
): Promise<void> {
  const prisma = getPrisma()
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!row) {
    return
  }

  for (const organizationId of await organizationsLeftEmptyBy(userId)) {
    await purgeOrganization(organizationId, actorUserId)
  }

  await forgetUserInJournal(userId)
  await prisma.deviceCode.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
  await recordEvent({
    action: "user.purged",
    actorUserId,
    targetType: "user",
    targetId: userId,
  })
}

export async function deleteOwnAccount(userId: string): Promise<void> {
  const held = await soleOwnerOrganizationOf(userId)

  if (held) {
    throw new SoleOwnerError(userId, held)
  }

  const prisma = getPrisma()
  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true },
  })

  for (const { organizationId } of memberships) {
    await unassignServersOfMember(organizationId, userId)
  }

  await purgeUser(userId, null)
}

export async function revokeUserSessionsFromPlatform(
  actor: PlatformUserActor,
  userId: string
): Promise<boolean> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) {
    return false
  }

  if (await belongsToPlatform(userId)) {
    throw new PlatformMemberProtectedError(userId)
  }

  await revokeSessions(userId)
  await recordEvent({
    action: "user.sessions_revoked",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
  })

  return true
}

export async function resendVerificationFromPlatform(
  userId: string
): Promise<boolean> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: STANDING_SELECT,
  })

  if (!user) {
    return false
  }

  if (user.emailVerified) {
    throw new EmailAlreadyVerifiedError(userId)
  }

  await getApiAuth().api.sendVerificationEmail({
    body: { email: user.email },
  })

  return true
}
