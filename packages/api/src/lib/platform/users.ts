import type { Prisma, ServerStatus } from "@pupitre/db/cloudflare/client"
import { isOrgRole, type OrgRole } from "@pupitre/shared/permissions"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { SEATED_STATUSES } from "../billing/seats"
import { liveAmong } from "../billing/subscription"
import { removeDevice } from "../devices/devices"
import { type AdminEventView, recentEvents } from "./events"

export interface AdminUserFilter {
  q?: string
  limit: number
  offset: number
}

export interface AdminUserOrganization {
  id: string
  name: string
  slug: string
  role: string
  subscription_status: string | null
  servers: number
}

export interface AdminUserView {
  id: string
  email: string
  name: string
  role: string | null
  banned: boolean
  email_verified: boolean
  created_at: Date
  organizations: AdminUserOrganization[]
}

export interface AdminUserPage {
  data: AdminUserView[]
  total: number
}

const ORGANIZATION_SELECT = {
  select: { id: true, name: true, slug: true },
} as const

interface OrganizationFacts {
  subscriptionStatus: Map<string, string>
  seated: Map<string, number>
}

async function organizationFacts(
  organizationIds: string[]
): Promise<OrganizationFacts> {
  if (organizationIds.length === 0) {
    return { subscriptionStatus: new Map(), seated: new Map() }
  }

  const prisma = getPrisma()
  const [subscriptions, seats] = await Promise.all([
    prisma.subscription.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: { updatedAt: "desc" },
      select: { organizationId: true, status: true },
    }),
    prisma.server.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: organizationIds },
        status: { in: SEATED_STATUSES },
      },
      _count: { _all: true },
    }),
  ])
  const byOrganization = new Map<string, { status: string }[]>()

  for (const subscription of subscriptions) {
    const rows = byOrganization.get(subscription.organizationId) ?? []

    rows.push(subscription)
    byOrganization.set(subscription.organizationId, rows)
  }

  const subscriptionStatus = new Map<string, string>()

  for (const [organizationId, rows] of byOrganization) {
    const live = liveAmong(rows)

    if (live) {
      subscriptionStatus.set(organizationId, live.status)
    }
  }

  return {
    subscriptionStatus,
    seated: new Map(seats.map((row) => [row.organizationId, row._count._all])),
  }
}

function whereOf(filter: AdminUserFilter) {
  const q = filter.q?.trim()

  return q
    ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] }
    : {}
}

const WITH_MEMBERSHIPS = {
  members: {
    orderBy: { createdAt: "asc" },
    include: { organization: ORGANIZATION_SELECT },
  },
} as const

type UserRow = Prisma.UserGetPayload<{ include: typeof WITH_MEMBERSHIPS }>

function toUserView(user: UserRow, facts: OrganizationFacts): AdminUserView {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    banned: user.banned ?? false,
    email_verified: user.emailVerified,
    created_at: user.createdAt,
    organizations: user.members.map((member) => ({
      ...member.organization,
      role: member.role,
      subscription_status:
        facts.subscriptionStatus.get(member.organizationId) ?? null,
      servers: facts.seated.get(member.organizationId) ?? 0,
    })),
  }
}

export async function listUsersForPlatform(
  filter: AdminUserFilter
): Promise<AdminUserPage> {
  const prisma = getPrisma()
  const where = whereOf(filter)
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit,
      skip: filter.offset,
      include: WITH_MEMBERSHIPS,
    }),
    prisma.user.count({ where }),
  ])
  const organizationIds = [
    ...new Set(
      users.flatMap((user) =>
        user.members.map((member) => member.organizationId)
      )
    ),
  ]
  const facts = await organizationFacts(organizationIds)

  return {
    data: users.map((user) => toUserView(user, facts)),
    total,
  }
}

export interface AdminUserDevice {
  id: string
  name: string
  created_at: Date
  last_used_at: Date | null
}

export interface AdminUserServer {
  id: string
  name: string
  host: string | null
  status: ServerStatus
  organization: { id: string; name: string }
}

export interface AdminUserDetail extends AdminUserView {
  devices: AdminUserDevice[]
  assigned_servers: AdminUserServer[]
  platform_role: OrgRole | null
  banned_reason: string | null
  ban_expires_at: Date | null
  events: AdminEventView[]
}

export class PlatformMemberProtectedError extends Error {
  constructor(userId: string) {
    super(`user ${userId} belongs to the platform organization`)
    this.name = "PlatformMemberProtectedError"
  }
}

export interface PlatformUserActor {
  userId: string
}

function platformRoleOf(user: UserRow): OrgRole | null {
  const member = user.members.find(
    (membership) => membership.organizationId === PLATFORM_ORGANIZATION_ID
  )

  return member && isOrgRole(member.role) ? member.role : null
}

export async function readUserForPlatform(
  userId: string
): Promise<AdminUserDetail | null> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: WITH_MEMBERSHIPS,
  })

  if (!user) {
    return null
  }

  const [facts, devices, servers, events] = await Promise.all([
    organizationFacts(user.members.map((member) => member.organizationId)),
    prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
    }),
    prisma.server.findMany({
      where: { assignedUserId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        host: true,
        status: true,
        organization: { select: { id: true, name: true } },
      },
    }),
    recentEvents({ actorUserId: userId }),
  ])

  return {
    ...toUserView(user, facts),
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      created_at: device.createdAt,
      last_used_at: device.lastUsedAt,
    })),
    assigned_servers: servers,
    platform_role: platformRoleOf(user),
    banned_reason: user.banReason,
    ban_expires_at: user.banExpires,
    events,
  }
}

async function belongsToPlatform(userId: string): Promise<boolean> {
  const member = await getPrisma().member.findFirst({
    where: { organizationId: PLATFORM_ORGANIZATION_ID, userId },
    select: { id: true },
  })

  return member !== null
}

/**
 * The ban bites now: the sessions already open and the device codes still
 * waiting are dropped with it, so neither the console nor the desktop app
 * keeps a credential the ban has just refused.
 */
export async function banUserFromPlatform(
  actor: PlatformUserActor,
  userId: string,
  reason: string
): Promise<AdminUserDetail | null> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) {
    return null
  }

  if (await belongsToPlatform(userId)) {
    throw new PlatformMemberProtectedError(userId)
  }

  await prisma.user.update({
    where: { id: userId },
    data: { banned: true, banReason: reason },
  })
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.deviceCode.deleteMany({ where: { userId } })
  await recordEvent({
    action: "user.banned",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
    payload: { reason },
  })

  return await readUserForPlatform(userId)
}

export function revokeDeviceFromPlatform(
  actor: PlatformUserActor,
  userId: string,
  deviceId: string,
  reason: string
): Promise<boolean> {
  return removeDevice(userId, deviceId, { actorUserId: actor.userId, reason })
}

export async function unbanUserFromPlatform(
  actor: PlatformUserActor,
  userId: string
): Promise<AdminUserDetail | null> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) {
    return null
  }

  await prisma.user.update({
    where: { id: userId },
    data: { banned: false, banReason: null, banExpires: null },
  })
  await recordEvent({
    action: "user.unbanned",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
  })

  return await readUserForPlatform(userId)
}
