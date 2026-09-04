import { sendServerEnrolledEmail } from "../../emails/notifications"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { entitlementWindow } from "../billing/entitlement"
import {
  countSeatedServers,
  type SeatQuotaSource,
  seatQuotaFor,
} from "../billing/seats"
import { fingerprintOfPublicKey } from "../devices/public-keys"
import {
  type EnrollmentRelease,
  releaseForEnrollment,
} from "../releases/releases"
import {
  generateEnrollmentToken,
  generateServerToken,
  hashEnrollmentToken,
  hashServerToken,
} from "./tokens"

export const ENROLLMENT_TTL_MS = 3_600_000

export const DEFAULT_SSH_PORT = 22

export const DEFAULT_SSH_USER = "dev"

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

  const [{ quota, source }, seated] = await Promise.all([
    seatQuotaFor(prisma),
    countSeatedServers(prisma),
  ])

  if (seated >= quota) {
    throw new SeatQuotaReachedError(quota, source)
  }

  const enrollmentToken = generateEnrollmentToken()
  const release = await releaseForEnrollment(input.probe.arch)
  const host = input.host.trim()
  const server = await prisma.server.create({
    data: {
      organizationId: actor.organizationId,
      name: host,
      host,
      port: input.port ?? DEFAULT_SSH_PORT,
      sshUser: input.ssh_user ?? DEFAULT_SSH_USER,
      arch: input.probe.arch,
      hostFingerprint: input.fingerprint ?? null,
      status: "enrolling",
      targetVersion: release.version,
      deviceId: device.id,
      assignedUserId: actor.userId,
      enrollmentTokenHash: await hashEnrollmentToken(enrollmentToken),
      enrollmentExpiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
    },
  })

  await recordEvent({
    action: "server.enrolled",
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: { host, port: server.port, ssh_user: server.sshUser },
  })

  return {
    server_id: server.id,
    enrollment_token: enrollmentToken,
    release,
  }
}

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

  if (server.status !== "enrolling" || server.serverTokenHash) {
    throw new EnrollmentTokenUsedError()
  }

  const expiresAt = server.enrollmentExpiresAt?.getTime() ?? 0

  if (expiresAt <= Date.now()) {
    throw new EnrollmentTokenExpiredError()
  }

  const serverToken = generateServerToken()
  const hostFingerprint = await fingerprintOfPublicKey(input.host_public_key)
  const burnt = await prisma.server.updateMany({
    where: { id: server.id, status: "enrolling", serverTokenHash: null },
    data: {
      status: "active",
      arch: input.arch,
      agentVersion: input.agent_version,
      hostFingerprint,
      serverTokenHash: await hashServerToken(serverToken),
      entitlementValidUntil: entitlementWindow(),
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
