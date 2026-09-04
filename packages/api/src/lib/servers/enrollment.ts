import type { ServerStatus } from "@pupitre/db/cloudflare/client"
import { getPrisma, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { fingerprintOfPublicKey } from "../devices/public-keys"
import {
  generateEnrollmentToken,
  generateServerToken,
  hashEnrollmentToken,
  hashServerToken,
} from "./tokens"

export const ENROLLMENT_TTL_MS = 3_600_000

export const ENTITLEMENT_TTL_MS = 86_400_000

export const DEFAULT_SSH_PORT = 22

export const DEFAULT_SSH_USER = "dev"

export const DEV_SEAT_QUOTA = 2

// PLT-06 publishes the signed binaries; until then the app pushes the agent it already carries.
export const STUB_RELEASE = {
  version: "0.0.0-dev",
  url: "",
  sha256: "",
  signature: "",
} as const

const SEATED_STATUSES: ServerStatus[] = [
  "enrolling",
  "active",
  "grace",
  "suspended",
]

export class SeatQuotaReachedError extends Error {
  readonly quota: number

  constructor(quota: number) {
    super(`the organization already uses its ${quota} seats`)
    this.name = "SeatQuotaReachedError"
    this.quota = quota
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
  release: typeof STUB_RELEASE
}

export interface ExchangeInput {
  enrollment_token: string
  host_public_key: string
  agent_version: string
  arch: string
}

async function seatQuota(
  prisma: ReturnType<typeof withOrganization>
): Promise<number> {
  const subscription = await prisma.subscription.findFirst({
    orderBy: { createdAt: "desc" },
    select: { quantity: true },
  })

  return subscription?.quantity ?? DEV_SEAT_QUOTA
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

  const [quota, seated] = await Promise.all([
    seatQuota(prisma),
    prisma.server.count({ where: { status: { in: SEATED_STATUSES } } }),
  ])

  if (seated >= quota) {
    throw new SeatQuotaReachedError(quota)
  }

  const enrollmentToken = generateEnrollmentToken()
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
      targetVersion: STUB_RELEASE.version,
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
    release: STUB_RELEASE,
  }
}

export async function exchangeEnrollmentToken(
  input: ExchangeInput
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
      entitlementValidUntil: new Date(Date.now() + ENTITLEMENT_TTL_MS),
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

  return { server_token: serverToken }
}
