import { slugify } from "@pupitre/auth/organizations"
import { isOrgRole, type OrgRole } from "@pupitre/shared/permissions"
import { LIVE_SUBSCRIPTION_STATUSES } from "@pupitre/shared/plans"
import {
  deletionDeadline,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
import {
  sendOrganizationClosedEmail,
  sendOrganizationRestoredEmail,
  sendOrganizationSuspendedEmail,
} from "../../emails/notifications"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { cancelSubscriptionByAdmin } from "../billing/admin"
import { applyOrganizationEntitlement } from "../billing/mirror"
import { unassignServersOfMember } from "../servers/assign"
import {
  type AdminOrganizationDetail,
  readOrganizationForPlatform,
} from "./organizations"

export interface PlatformOrganizationActor {
  userId: string
}

export class PlatformOrganizationProtectedError extends Error {
  constructor() {
    super(
      "the Pupitre organization is not suspended, closed, renamed or deleted"
    )
    this.name = "PlatformOrganizationProtectedError"
  }
}

export class OrganizationAlreadySuspendedError extends Error {
  constructor(organizationId: string) {
    super(`organization ${organizationId} is already suspended`)
    this.name = "OrganizationAlreadySuspendedError"
  }
}

export class OrganizationNotSuspendedError extends Error {
  constructor(organizationId: string) {
    super(`organization ${organizationId} is not suspended`)
    this.name = "OrganizationNotSuspendedError"
  }
}

export class OrganizationAlreadyClosedError extends Error {
  constructor(organizationId: string) {
    super(`organization ${organizationId} is already closed`)
    this.name = "OrganizationAlreadyClosedError"
  }
}

export class OrganizationNotClosedError extends Error {
  constructor(organizationId: string) {
    super(`organization ${organizationId} is neither closed nor being deleted`)
    this.name = "OrganizationNotClosedError"
  }
}

export class SlugTakenError extends Error {
  readonly slug: string

  constructor(slug: string) {
    super(`the slug ${slug} is already taken`)
    this.name = "SlugTakenError"
    this.slug = slug
  }
}

export class SlugEmptyError extends Error {
  constructor(slug: string) {
    super(`the slug ${slug} normalizes to nothing`)
    this.name = "SlugEmptyError"
  }
}

export class NotAMemberError extends Error {
  constructor(userId: string, organizationId: string) {
    super(`user ${userId} is not a member of organization ${organizationId}`)
    this.name = "NotAMemberError"
  }
}

export class LastOwnerError extends Error {
  constructor(organizationId: string) {
    super(`organization ${organizationId} would be left without an owner`)
    this.name = "LastOwnerError"
  }
}

const LIFECYCLE_SELECT = {
  id: true,
  name: true,
  slug: true,
  suspendedAt: true,
  closedAt: true,
  deletionAt: true,
} as const

interface OrganizationStandingRow {
  id: string
  name: string
  slug: string
  suspendedAt: Date | null
  closedAt: Date | null
  deletionAt: Date | null
}

function readStanding(
  organizationId: string
): Promise<OrganizationStandingRow | null> {
  return getPrisma().organization.findUnique({
    where: { id: organizationId },
    select: LIFECYCLE_SELECT,
  })
}

function assertNotPlatform(organizationId: string): void {
  if (organizationId === PLATFORM_ORGANIZATION_ID) {
    throw new PlatformOrganizationProtectedError()
  }
}

// Only machines in use go down, so a reopening never turns an enrolment into an active server.
async function suspendOrganizationServers(
  actor: PlatformOrganizationActor,
  organizationId: string,
  reason: string
): Promise<number> {
  const prisma = getPrisma()
  const servers = await prisma.server.findMany({
    where: { organizationId, status: { in: ["active", "grace"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, host: true, status: true },
  })

  if (servers.length === 0) {
    return 0
  }

  await prisma.server.updateMany({
    where: { id: { in: servers.map((server) => server.id) } },
    data: {
      status: "suspended",
      suspendedReason: "admin",
      suspendedByOrganization: true,
    },
  })

  for (const server of servers) {
    await recordEvent({
      action: "server.suspended",
      actorUserId: actor.userId,
      organizationId,
      targetType: "server",
      targetId: server.id,
      payload: {
        reason,
        host: server.host,
        name: server.name,
        previous_status: server.status,
        via: "organization",
      },
    })
  }

  return servers.length
}

// Servers come back to what the subscription now allows: a lapsed one leaves them in grace.
async function releaseOrganizationServers(
  organizationId: string,
  now: Date
): Promise<number> {
  const prisma = getPrisma()
  const { count } = await prisma.server.updateMany({
    where: { organizationId, suspendedByOrganization: true },
    data: { suspendedReason: "billing", suspendedByOrganization: false },
  })

  await applyOrganizationEntitlement(organizationId, now)

  return count
}

export async function suspendOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  reason: string,
  now: Date = new Date()
): Promise<AdminOrganizationDetail | null> {
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  assertNotPlatform(organizationId)

  if (organization.suspendedAt) {
    throw new OrganizationAlreadySuspendedError(organizationId)
  }

  await getPrisma().organization.update({
    where: { id: organizationId },
    data: {
      suspendedAt: now,
      suspendedReason: reason,
      suspendedByUserId: actor.userId,
    },
  })

  const suspended = await suspendOrganizationServers(
    actor,
    organizationId,
    reason
  )

  await recordEvent({
    action: "organization.suspended",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: { reason, servers: suspended },
  })
  await sendOrganizationSuspendedEmail({
    organizationId,
    reason,
    serverCount: suspended,
  })

  return await readOrganizationForPlatform(organizationId)
}

export async function restoreOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  now: Date = new Date()
): Promise<AdminOrganizationDetail | null> {
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  if (!organization.suspendedAt) {
    throw new OrganizationNotSuspendedError(organizationId)
  }

  await getPrisma().organization.update({
    where: { id: organizationId },
    data: {
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
    },
  })

  const released = organization.closedAt
    ? 0
    : await releaseOrganizationServers(organizationId, now)

  await recordEvent({
    action: "organization.restored",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: { servers: released },
  })
  await sendOrganizationRestoredEmail({
    organizationId,
    serverCount: released,
  })

  return await readOrganizationForPlatform(organizationId)
}

// Runs before the servers go down: the cancellation reads the servers it is about to take down.
async function stopLiveSubscription(
  actor: PlatformOrganizationActor,
  organizationId: string,
  reason: string,
  now: Date
): Promise<string | null> {
  const subscription = await getPrisma().subscription.findFirst({
    where: { organizationId, status: { in: LIVE_SUBSCRIPTION_STATUSES } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })

  if (!subscription) {
    return null
  }

  await cancelSubscriptionByAdmin(actor, subscription.id, reason, now)

  return subscription.id
}

async function applyClosure(
  actor: PlatformOrganizationActor,
  organizationId: string,
  reason: string,
  now: Date
): Promise<{ servers: number; subscriptionId: string | null }> {
  await getPrisma().organization.update({
    where: { id: organizationId },
    data: {
      closedAt: now,
      closedReason: reason,
      closedByUserId: actor.userId,
    },
  })

  const subscriptionId = await stopLiveSubscription(
    actor,
    organizationId,
    reason,
    now
  )
  const servers = await suspendOrganizationServers(
    actor,
    organizationId,
    reason
  )

  return { servers, subscriptionId }
}

export async function closeOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  reason: string,
  now: Date = new Date()
): Promise<AdminOrganizationDetail | null> {
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  assertNotPlatform(organizationId)

  if (organization.closedAt) {
    throw new OrganizationAlreadyClosedError(organizationId)
  }

  const applied = await applyClosure(actor, organizationId, reason, now)

  await recordEvent({
    action: "organization.closed",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: {
      reason,
      servers: applied.servers,
      subscription_id: applied.subscriptionId,
    },
  })
  await sendOrganizationClosedEmail({ organizationId, reason })

  return await readOrganizationForPlatform(organizationId)
}

export async function reopenOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  now: Date = new Date()
): Promise<AdminOrganizationDetail | null> {
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  if (!(organization.closedAt || organization.deletionAt)) {
    throw new OrganizationNotClosedError(organizationId)
  }

  await getPrisma().organization.update({
    where: { id: organizationId },
    data: {
      closedAt: null,
      closedReason: null,
      closedByUserId: null,
      deletionAt: null,
      deletionReason: null,
      deletionByUserId: null,
    },
  })

  const released = organization.suspendedAt
    ? 0
    : await releaseOrganizationServers(organizationId, now)

  await recordEvent({
    action: "organization.reopened",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: {
      servers: released,
      was_closed: Boolean(organization.closedAt),
      was_deleting: Boolean(organization.deletionAt),
    },
  })

  return await readOrganizationForPlatform(organizationId)
}

export type OrganizationDeletion =
  | { deletion: "scheduled"; organization: AdminOrganizationDetail }
  | { deletion: "purged" }

export async function deleteOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  reason: string,
  now: Date = new Date()
): Promise<OrganizationDeletion | null> {
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  assertNotPlatform(organizationId)

  if (organization.deletionAt) {
    await purgeOrganization(organization.id, actor.userId)

    return { deletion: "purged" }
  }

  await getPrisma().organization.update({
    where: { id: organizationId },
    data: {
      deletionAt: deletionDeadline(now),
      deletionReason: reason,
      deletionByUserId: actor.userId,
    },
  })

  if (!organization.closedAt) {
    await applyClosure(actor, organizationId, reason, now)
  }

  await recordEvent({
    action: "organization.deleted",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: { reason, purge_at: deletionDeadline(now).toISOString() },
  })

  const scheduled = await readOrganizationForPlatform(organizationId)

  return scheduled ? { deletion: "scheduled", organization: scheduled } : null
}

// The journal holds personal data (hosts, reasons, addresses): it goes too, only the identifier stays.
export async function purgeOrganization(
  organizationId: string,
  actorUserId: string | null
): Promise<void> {
  const prisma = getPrisma()

  await withOrganization(prisma, organizationId).event.deleteMany({
    where: {},
  })
  await prisma.event.deleteMany({
    where: { targetType: "organization", targetId: organizationId },
  })
  await prisma.organization.delete({ where: { id: organizationId } })
  await recordEvent({
    action: "organization.purged",
    actorUserId,
    targetType: "organization",
    targetId: organizationId,
  })
}

export interface OrganizationRename {
  name?: string
  slug?: string
}

export async function renameOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  input: OrganizationRename
): Promise<AdminOrganizationDetail | null> {
  const prisma = getPrisma()
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  assertNotPlatform(organizationId)

  const slug = input.slug === undefined ? undefined : slugify(input.slug)

  if (slug === "") {
    throw new SlugEmptyError(input.slug ?? "")
  }

  if (slug !== undefined && slug !== organization.slug) {
    const taken = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (taken) {
      throw new SlugTakenError(slug)
    }
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(slug === undefined ? {} : { slug }),
    },
  })
  await recordEvent({
    action: "organization.updated",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: {
      name: { from: organization.name, to: input.name ?? organization.name },
      slug: { from: organization.slug, to: slug ?? organization.slug },
    },
  })

  return await readOrganizationForPlatform(organizationId)
}

export async function transferOrganizationFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  userId: string
): Promise<AdminOrganizationDetail | null> {
  const prisma = getPrisma()
  const organization = await readStanding(organizationId)

  if (!organization) {
    return null
  }

  assertNotPlatform(organizationId)

  const member = await prisma.member.findFirst({
    where: { organizationId, userId },
    select: { id: true, role: true },
  })

  if (!member) {
    throw new NotAMemberError(userId, organizationId)
  }

  const previous = await prisma.member.findMany({
    where: { organizationId, role: "owner", NOT: { userId } },
    select: { userId: true },
  })

  await prisma.member.updateMany({
    where: { organizationId, role: "owner", NOT: { userId } },
    data: { role: "admin" },
  })
  await prisma.member.updateMany({
    where: { organizationId, userId },
    data: { role: "owner" },
  })
  await recordEvent({
    action: "organization.transferred",
    actorUserId: actor.userId,
    organizationId,
    targetType: "organization",
    targetId: organizationId,
    payload: {
      owner_user_id: userId,
      previous_owner_user_ids: previous.map((row) => row.userId),
    },
  })

  return await readOrganizationForPlatform(organizationId)
}

function roleOf(value: string): OrgRole | null {
  return isOrgRole(value) ? value : null
}

export async function removeMemberFromPlatform(
  actor: PlatformOrganizationActor,
  organizationId: string,
  userId: string,
  reason: string
): Promise<boolean> {
  assertNotPlatform(organizationId)

  const prisma = getPrisma()
  const member = await prisma.member.findFirst({
    where: { organizationId, userId },
    select: { id: true, role: true },
  })

  if (!member) {
    return false
  }

  if (roleOf(member.role) === "owner") {
    const owners = await prisma.member.count({
      where: { organizationId, role: "owner" },
    })

    if (owners <= 1) {
      throw new LastOwnerError(organizationId)
    }
  }

  await prisma.member.delete({ where: { id: member.id } })
  await unassignServersOfMember(organizationId, userId, {
    actorUserId: actor.userId,
    reason,
  })

  return true
}
