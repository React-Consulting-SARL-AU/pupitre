import { sendServerEnrolledEmail } from "../../emails/notifications"
import {
  getPrisma,
  type OrganizationPrisma,
  withOrganization,
} from "../api/prisma"
import { recordEvent } from "../audit/audit"
import {
  type EntitlementRefusal,
  entitlementRefusalFor,
  entitlementWindow,
} from "../billing/entitlement"
import {
  countSeatedServers,
  SEATED_STATUSES,
  type SeatQuotaSource,
  seatQuotaFor,
} from "../billing/seats"
import { fingerprintOfPublicKey } from "../devices/public-keys"
import {
  type EnrollmentRelease,
  releaseForEnrollment,
} from "../releases/releases"
import { enrollmentKeyOf, isEnrollmentKeyConflict } from "./enrollment-key"
import {
  generateEnrollmentToken,
  generateServerToken,
  hashEnrollmentToken,
  hashServerToken,
} from "./tokens"

export const ENROLLMENT_TTL_MS = 3_600_000

export const DEFAULT_SSH_PORT = 22

export const DEFAULT_SSH_USER = "dev"

export class EntitlementMissingError extends Error {
  readonly refusal: EntitlementRefusal

  constructor(refusal: EntitlementRefusal) {
    super(`the organization has no usable subscription: ${refusal}`)
    this.name = "EntitlementMissingError"
    this.refusal = refusal
  }
}

export class SeatQuotaReachedError extends Error {
  readonly quota: number
  readonly source: SeatQuotaSource

  constructor(quota: number, source: SeatQuotaSource) {
    super(`the organization already uses its ${quota} seats`)
    this.name = "SeatQuotaReachedError"
    this.quota = quota
    this.source = source
  }
}

export class EnrollmentDeviceUnknownError extends Error {
  constructor() {
    super("this device does not belong to the caller")
    this.name = "EnrollmentDeviceUnknownError"
  }
}

export class EnrollmentTokenUnknownError extends Error {
  constructor() {
    super("no server carries this enrollment token")
    this.name = "EnrollmentTokenUnknownError"
  }
}

export class EnrollmentTokenUsedError extends Error {
  constructor() {
    super("this enrollment token was already exchanged")
    this.name = "EnrollmentTokenUsedError"
  }
}

export class EnrollmentTokenExpiredError extends Error {
  constructor() {
    super("this enrollment token expired")
    this.name = "EnrollmentTokenExpiredError"
  }
}

export interface EnrollActor {
  userId: string
  organizationId: string
}

export interface EnrollInput {
  device_id: string
  host: string
  port?: number
  ssh_user?: string
  fingerprint?: string
  probe: { arch: string }
}

export interface EnrollResult {
  server_id: string
  enrollment_token: string
  release: EnrollmentRelease
}

export interface ExchangeInput {
  enrollment_token: string
  host_public_key: string
  agent_version: string
  arch: string
}

interface EnrollTarget {
  host: string
  port: number
  deviceId: string
}

interface ClaimedServer {
  server: Awaited<ReturnType<typeof createServer>>
  repaired: boolean
}

interface EnrollmentGrant {
  arch: string
  sshUser: string
  targetVersion: string
  enrollmentKey: string
  enrollmentTokenHash: string
  enrollmentExpiresAt: Date
  hostFingerprint?: string
}

function seatedServerAt(prisma: OrganizationPrisma, target: EnrollTarget) {
  return prisma.server.findFirst({
    where: { ...target, status: { in: SEATED_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
}

async function createServer(
  prisma: OrganizationPrisma,
  actor: EnrollActor,
  target: EnrollTarget,
  grant: EnrollmentGrant
) {
  const [{ quota, source }, seated] = await Promise.all([
    seatQuotaFor(prisma),
    countSeatedServers(prisma),
  ])

  if (seated >= quota) {
    throw new SeatQuotaReachedError(quota, source)
  }

  return await prisma.server.create({
    data: {
      ...target,
      ...grant,
      organizationId: actor.organizationId,
      name: target.host,
      status: "enrolling",
      assignedUserId: actor.userId,
    },
  })
}

/**
 * A new enrollment granted to a server the organization already holds.
 *
 * Its server token and status don't move: the machine keeps the access it
 * has until the exchange gives it another. Clearing them here would leave,
 * at the slightest failure between the grant and the exchange, a machine
 * whose token no longer works and a row stuck in `enrolling` — which
 * `ExpireEnrollments` revokes an hour later.
 */
async function repairServer(
  prisma: OrganizationPrisma,
  serverId: string,
  grant: EnrollmentGrant
) {
  const repaired = await prisma.server.updateMany({
    where: { id: serverId, status: { in: SEATED_STATUSES } },
    data: grant,
  })

  if (repaired.count === 0) {
    return null
  }

  return await prisma.server.findFirst({ where: { id: serverId } })
}

async function repairSeatedServer(
  prisma: OrganizationPrisma,
  target: EnrollTarget,
  grant: EnrollmentGrant
) {
  const known = await seatedServerAt(prisma, target)

  return known ? await repairServer(prisma, known.id, grant) : null
}

async function claimServer(
  prisma: OrganizationPrisma,
  actor: EnrollActor,
  target: EnrollTarget,
  grant: EnrollmentGrant
): Promise<ClaimedServer> {
  const repaired = await repairSeatedServer(prisma, target, grant)

  if (repaired) {
    return { server: repaired, repaired: true }
  }

  try {
    return {
      server: await createServer(prisma, actor, target, grant),
      repaired: false,
    }
  } catch (error) {
    if (!isEnrollmentKeyConflict(error)) {
      throw error
    }

    const raced = await repairSeatedServer(prisma, target, grant)

    if (!raced) {
      throw error
    }

    return { server: raced, repaired: true }
  }
}

export async function enrollServer(
  actor: EnrollActor,
  input: EnrollInput
): Promise<EnrollResult> {
  const prisma = withOrganization(getPrisma(), actor.organizationId)
  const device = await prisma.device.findFirst({
    where: { id: input.device_id, userId: actor.userId },
    select: { id: true },
  })

  if (!device) {
    throw new EnrollmentDeviceUnknownError()
  }

  const refusal = await entitlementRefusalFor(actor.organizationId)

  if (refusal) {
    throw new EntitlementMissingError(refusal)
  }

  const target: EnrollTarget = {
    host: input.host.trim(),
    port: input.port ?? DEFAULT_SSH_PORT,
    deviceId: device.id,
  }

  const enrollmentToken = generateEnrollmentToken()
  const release = await releaseForEnrollment(input.probe.arch)
  const grant: EnrollmentGrant = {
    arch: input.probe.arch,
    sshUser: input.ssh_user ?? DEFAULT_SSH_USER,
    targetVersion: release.version,
    enrollmentKey: enrollmentKeyOf({
      ...target,
      organizationId: actor.organizationId,
    }),
    enrollmentTokenHash: await hashEnrollmentToken(enrollmentToken),
    enrollmentExpiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
    ...(input.fingerprint ? { hostFingerprint: input.fingerprint } : {}),
  }

  const { server, repaired } = await claimServer(prisma, actor, target, grant)

  await recordEvent({
    action: "server.enrolled",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      host: target.host,
      port: server.port,
      ssh_user: server.sshUser,
      repaired,
    },
  })

  return {
    server_id: server.id,
    enrollment_token: enrollmentToken,
    release,
  }
}

/**
 * The enrollment token, exchanged once for a server token.
 *
 * What's only valid once is the token, and its expiry is what says so: it
 * drops at the moment of the exchange, under the same conditional write, so
 * two concurrent exchanges collapse into one. The server itself may well
 * already carry a token — a machine being re-enrolled keeps a valid one
 * until this exchange replaces it.
 */
export async function exchangeEnrollmentToken(
  input: ExchangeInput,
  acceptLanguage: string | null = null
): Promise<{ server_token: string }> {
  const prisma = getPrisma()
  const enrollmentTokenHash = await hashEnrollmentToken(input.enrollment_token)
  const server = await prisma.server.findUnique({
    where: { enrollmentTokenHash },
  })

  if (!server) {
    throw new EnrollmentTokenUnknownError()
  }

  const grantedUntil = server.enrollmentExpiresAt

  if (!grantedUntil) {
    throw new EnrollmentTokenUsedError()
  }

  if (grantedUntil.getTime() <= Date.now()) {
    throw new EnrollmentTokenExpiredError()
  }

  const serverToken = generateServerToken()
  const hostFingerprint = await fingerprintOfPublicKey(input.host_public_key)
  const burnt = await prisma.server.updateMany({
    where: { id: server.id, enrollmentExpiresAt: grantedUntil },
    data: {
      status: "active",
      arch: input.arch,
      agentVersion: input.agent_version,
      hostFingerprint,
      serverTokenHash: await hashServerToken(serverToken),
      entitlementValidUntil: entitlementWindow(),
      enrollmentExpiresAt: null,
    },
  })

  if (burnt.count === 0) {
    throw new EnrollmentTokenUsedError()
  }

  await recordEvent({
    action: "server.exchanged",
    actorUserId: null,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      agent_version: input.agent_version,
      arch: input.arch,
      host_fingerprint: hostFingerprint,
    },
  })

  const ready = await prisma.server.findUnique({ where: { id: server.id } })

  if (ready) {
    await sendServerEnrolledEmail({ server: ready, acceptLanguage })
  }

  return { server_token: serverToken }
}
