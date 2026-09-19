import { deletionDeadline } from "@pupitre/shared/platform"
import { getApiAuth } from "../api/plugins/auth"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { SEATED_STATUSES } from "../billing/seats"
import { LIVE_SUBSCRIPTION_STATUSES } from "../billing/subscription"
import { removeDevice } from "../devices/devices"
import { unassignServersOfMember } from "../servers/assign"
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

/** Every device goes, so the account's keys leave the servers, and every assignment with them. */
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

/** An organization nobody else owns and that still holds a seated machine or a billed subscription would be left to nobody. */
export async function soleOwnerOrganizationOf(
  userId: string
): Promise<string | null> {
  const prisma = getPrisma()
  const owned = await prisma.member.findMany({
    where: { userId, role: "owner" },
    select: { organizationId: true },
  })

  for (const { organizationId } of owned) {
    const owners = await prisma.member.count({
      where: { organizationId, role: "owner" },
    })

    if (owners > 1) {
      continue
    }

    const [servers, subscriptions] = await Promise.all([
      prisma.server.count({
        where: { organizationId, status: { in: SEATED_STATUSES } },
      }),
      prisma.subscription.count({
        where: {
          organizationId,
          status: { in: LIVE_SUBSCRIPTION_STATUSES },
        },
      }),
    ])

    if (servers > 0 || subscriptions > 0) {
      return organizationId
    }
  }

  return null
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
    await purgeUser({ id: user.id, email: user.email }, actor.userId)

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

export interface PurgedUser {
  id: string
  email: string
}

/** The row leaves for good; the journal keeps who it was, since the identifier alone says nothing. */
export async function purgeUser(
  user: PurgedUser,
  actorUserId: string | null
): Promise<void> {
  const prisma = getPrisma()
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true },
  })

  if (!row) {
    return
  }

  await prisma.deviceCode.deleteMany({ where: { userId: row.id } })
  await prisma.user.delete({ where: { id: row.id } })
  await recordEvent({
    action: "user.purged",
    actorUserId,
    targetType: "user",
    targetId: row.id,
    payload: { email: row.email, name: row.name },
  })
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
