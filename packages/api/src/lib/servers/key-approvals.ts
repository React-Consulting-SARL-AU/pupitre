import {
  type AgentStateKey,
  KEY_APPROVAL_FUTURE_SKEW_SECONDS,
  KEY_APPROVAL_HASHES,
  KEY_APPROVAL_MAX_AGE_SECONDS,
  KEY_APPROVAL_NAMESPACE,
  type KeyApprovalSubmission,
  type KeysBeat,
  KeysBeatSchema,
  keyBlobFingerprint,
  type PendingKeyApproval,
  readSshSignature,
} from "@pupitre/shared/keys"
import { isOrgRole, type OrgRole } from "@pupitre/shared/permissions"
import { type ApiPrisma, getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { type HeldDevice, heldDevicesForServer } from "./authorized-keys"

const WHITESPACE_RE = /\s+/

const SECOND_MS = 1000

interface KeyReport extends KeysBeat {
  reported_at: string
}

export type KeyApprovalRefusal =
  | "mismatch"
  | "not_held"
  | "signer"
  | "issued_at"
  | "signature"

export class KeyApprovalTargetUnknownError extends Error {
  constructor() {
    super("no server or device the caller can see answers this approval")
    this.name = "KeyApprovalTargetUnknownError"
  }
}

export class KeyApprovalForbiddenError extends Error {
  constructor() {
    super("the caller may not approve this device on this server")
    this.name = "KeyApprovalForbiddenError"
  }
}

export class KeyApprovalInvalidError extends Error {
  readonly refusal: KeyApprovalRefusal

  constructor(refusal: KeyApprovalRefusal) {
    super(`the approval is refused: ${refusal}`)
    this.name = "KeyApprovalInvalidError"
    this.refusal = refusal
  }
}

export interface KeyApprovalReceipt {
  server_id: string
  device_id: string
  signer: string
  issued_at: string
}

/** The key as an approval names it: `type base64`, the comment dropped. */
function approvedKeyOf(publicKey: string): string {
  const [type, body] = publicKey.trim().split(WHITESPACE_RE)

  return `${type} ${body}`
}

function readKeyReport(value: unknown): KeyReport | null {
  const parsed = KeysBeatSchema.safeParse(value)
  const reportedAt = (value as { reported_at?: unknown } | null)?.reported_at

  if (!parsed.success || typeof reportedAt !== "string") {
    return null
  }

  return { ...parsed.data, reported_at: reportedAt }
}

/** An owner or admin approves any key a server of theirs waits for; a member, only their own on the server they hold. */
function mayApprove(
  callerId: string,
  role: OrgRole | null,
  assignedUserId: string | null,
  deviceOwnerId: string
): boolean {
  if (role === "owner" || role === "admin") {
    return true
  }

  return (
    role !== null && assignedUserId === callerId && deviceOwnerId === callerId
  )
}

export async function keysForServer(
  prisma: ApiPrisma,
  serverId: string,
  held: HeldDevice[]
): Promise<AgentStateKey[]> {
  if (held.length === 0) {
    return []
  }

  const approvals = await prisma.keyApproval.findMany({
    where: { serverId, deviceId: { in: held.map((device) => device.id) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  return held.map((device) => {
    const publicKey = approvedKeyOf(device.publicKey)

    return {
      public_key: publicKey,
      user_id: device.userId,
      device_id: device.id,
      approvals: approvals
        .filter((approval) => approval.deviceId === device.id)
        .map((approval) => ({
          server_id: serverId,
          public_key: publicKey,
          user_id: approval.userId,
          issued_at: approval.issuedAt,
          signer: approval.signer,
          signature: approval.signature,
        })),
    }
  })
}

async function rolesOf(
  prisma: ApiPrisma,
  userId: string
): Promise<Map<string, OrgRole>> {
  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true, role: true },
  })
  const roles = new Map<string, OrgRole>()

  for (const membership of memberships) {
    if (isOrgRole(membership.role)) {
      roles.set(membership.organizationId, membership.role)
    }
  }

  return roles
}

async function ownFingerprints(
  prisma: ApiPrisma,
  userId: string
): Promise<Set<string>> {
  const devices = await prisma.device.findMany({
    where: { userId },
    select: { fingerprint: true },
  })

  return new Set(devices.map((device) => device.fingerprint))
}

export async function listPendingKeyApprovals(
  userId: string,
  now: Date = new Date()
): Promise<PendingKeyApproval[]> {
  const prisma = getPrisma()
  const [roles, own] = await Promise.all([
    rolesOf(prisma, userId),
    ownFingerprints(prisma, userId),
  ])

  if (roles.size === 0 || own.size === 0) {
    return []
  }

  const servers = await prisma.server.findMany({
    where: {
      organizationId: { in: [...roles.keys()] },
      status: { not: "revoked" },
      assignedUserId: { not: null },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      organizationId: true,
      assignedUserId: true,
      keyReport: true,
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  })
  const pending: PendingKeyApproval[] = []

  for (const server of servers) {
    const report = readKeyReport(server.keyReport)
    const signers = report?.signers.filter((signer) => own.has(signer)) ?? []

    if (!(report && server.assignedUser) || signers.length === 0) {
      continue
    }

    const role = roles.get(server.organizationId) ?? null
    const waiting = new Set(report.pending)
    const held = await heldDevicesForServer(prisma, server.id, now)

    for (const device of held) {
      if (
        waiting.has(device.fingerprint) &&
        mayApprove(userId, role, server.assignedUserId, device.userId)
      ) {
        pending.push({
          server: { id: server.id, name: server.name },
          device: {
            id: device.id,
            name: device.name,
            fingerprint: device.fingerprint,
            public_key: approvedKeyOf(device.publicKey),
          },
          user: server.assignedUser,
          signers,
          reported_at: report.reported_at,
        })
      }
    }
  }

  return pending
}

function issuedInWindow(issuedAt: string, now: Date): boolean {
  const issued = Date.parse(issuedAt)

  if (Number.isNaN(issued)) {
    return false
  }

  return (
    issued >= now.getTime() - KEY_APPROVAL_MAX_AGE_SECONDS * SECOND_MS &&
    issued <= now.getTime() + KEY_APPROVAL_FUTURE_SKEW_SECONDS * SECOND_MS
  )
}

async function signedBy(signature: string, signer: string): Promise<boolean> {
  const envelope = readSshSignature(signature)

  if (
    !envelope ||
    envelope.namespace !== KEY_APPROVAL_NAMESPACE ||
    !(KEY_APPROVAL_HASHES as readonly string[]).includes(envelope.hashAlgorithm)
  ) {
    return false
  }

  return (await keyBlobFingerprint(envelope.publicKey)) === signer
}

async function visibleTarget(
  prisma: ApiPrisma,
  userId: string,
  input: KeyApprovalSubmission
) {
  const server = await prisma.server.findUnique({
    where: { id: input.server_id },
    select: {
      id: true,
      organizationId: true,
      assignedUserId: true,
      status: true,
    },
  })

  if (!server || server.status === "revoked") {
    return null
  }

  const [membership, device] = await Promise.all([
    prisma.member.findFirst({
      where: { organizationId: server.organizationId, userId },
      select: { role: true },
    }),
    prisma.device.findUnique({ where: { id: input.device_id } }),
  ])

  if (!(membership && device)) {
    return null
  }

  const ownerJoined = await prisma.member.findFirst({
    where: { organizationId: server.organizationId, userId: device.userId },
    select: { id: true },
  })

  if (!ownerJoined) {
    return null
  }

  const role = isOrgRole(membership.role) ? membership.role : null

  return { server, device, role }
}

async function refusalOf(
  prisma: ApiPrisma,
  userId: string,
  input: KeyApprovalSubmission,
  target: { device: HeldDevice; serverId: string },
  now: Date
): Promise<KeyApprovalRefusal | null> {
  const { device, serverId } = target

  if (
    input.public_key !== approvedKeyOf(device.publicKey) ||
    input.user_id !== device.userId
  ) {
    return "mismatch"
  }

  const held = await heldDevicesForServer(prisma, serverId, now)

  if (!held.some((candidate) => candidate.id === device.id)) {
    return "not_held"
  }

  if (!(await ownFingerprints(prisma, userId)).has(input.signer)) {
    return "signer"
  }

  if (!issuedInWindow(input.issued_at, now)) {
    return "issued_at"
  }

  if (!(await signedBy(input.signature, input.signer))) {
    return "signature"
  }

  return null
}

/**
 * The platform relays the approval, it does not judge it: the agent alone
 * verifies the signature. What is refused here is what could never verify,
 * and a caller who has no say over this key on this server.
 */
export async function submitKeyApproval(
  userId: string,
  input: KeyApprovalSubmission,
  now: Date = new Date()
): Promise<KeyApprovalReceipt> {
  const prisma = getPrisma()
  const target = await visibleTarget(prisma, userId, input)

  if (!target) {
    throw new KeyApprovalTargetUnknownError()
  }

  const { server, device, role } = target

  if (!mayApprove(userId, role, server.assignedUserId, device.userId)) {
    throw new KeyApprovalForbiddenError()
  }

  const refusal = await refusalOf(
    prisma,
    userId,
    input,
    { device, serverId: server.id },
    now
  )

  if (refusal) {
    throw new KeyApprovalInvalidError(refusal)
  }

  const signed = {
    userId: input.user_id,
    issuedAt: input.issued_at,
    signature: input.signature,
    approvedByUserId: userId,
  }

  await prisma.keyApproval.upsert({
    where: {
      serverId_deviceId_signer: {
        serverId: server.id,
        deviceId: device.id,
        signer: input.signer,
      },
    },
    create: {
      serverId: server.id,
      deviceId: device.id,
      signer: input.signer,
      ...signed,
    },
    update: signed,
  })

  await recordEvent({
    action: "key.approved",
    actorUserId: userId,
    organizationId: server.organizationId,
    targetType: "server",
    targetId: server.id,
    payload: {
      device_id: device.id,
      device_fingerprint: device.fingerprint,
      signer: input.signer,
    },
  })

  return {
    server_id: server.id,
    device_id: device.id,
    signer: input.signer,
    issued_at: input.issued_at,
  }
}
