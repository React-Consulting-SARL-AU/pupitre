import type { Device } from "@pupitre/db/cloudflare/client"
import { FRESH_SIGN_IN_SECONDS } from "@pupitre/shared/keys"
import { sendDeviceAddedEmail } from "../../emails/notifications"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { readEd25519PublicKey } from "./public-keys"

const SECOND_MS = 1000

export class DeviceAlreadyExistsError extends Error {
  readonly fingerprint: string

  constructor(fingerprint: string) {
    super(`a device already carries ${fingerprint}`)
    this.name = "DeviceAlreadyExistsError"
    this.fingerprint = fingerprint
  }
}

export class ReauthenticationRequiredError extends Error {
  constructor() {
    super("the sign-in behind this session is too old to add a device")
    this.name = "ReauthenticationRequiredError"
  }
}

export interface DeviceInput {
  name: string
  public_key: string
}

export interface DeviceView {
  id: string
  name: string
  public_key: string
  fingerprint: string
  last_used_at: Date | null
  created_at: Date
}

function toView(device: Device): DeviceView {
  return {
    id: device.id,
    name: device.name,
    public_key: device.publicKey,
    fingerprint: device.fingerprint,
    last_used_at: device.lastUsedAt,
    created_at: device.createdAt,
  }
}

export async function listDevices(userId: string): Promise<DeviceView[]> {
  const devices = await getPrisma().device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  })

  return devices.map(toView)
}

// A session opens only after the full sign-in, second factor included, so its age is that proof's age.
function assertFreshSignIn(signedInAt: Date, now: Date): void {
  if (
    now.getTime() - signedInAt.getTime() >
    FRESH_SIGN_IN_SECONDS * SECOND_MS
  ) {
    throw new ReauthenticationRequiredError()
  }
}

export async function addDevice(
  userId: string,
  input: DeviceInput,
  signedInAt: Date,
  acceptLanguage: string | null = null
): Promise<DeviceView> {
  assertFreshSignIn(signedInAt, new Date())

  const { key, fingerprint } = await readEd25519PublicKey(input.public_key)
  const prisma = getPrisma()
  const known = await prisma.device.findUnique({
    where: { fingerprint },
    select: { id: true },
  })

  if (known) {
    throw new DeviceAlreadyExistsError(fingerprint)
  }

  const device = await prisma.device.create({
    data: { userId, name: input.name.trim(), publicKey: key, fingerprint },
  })

  await recordEvent({
    action: "device.added",
    actorUserId: userId,
    targetType: "device",
    targetId: device.id,
    payload: { fingerprint, name: device.name },
  })

  await sendDeviceAddedEmail({ userId, device, acceptLanguage })

  return toView(device)
}

export interface PlatformRevocation {
  actorUserId: string
  reason: string
}

export async function removeDevice(
  userId: string,
  deviceId: string,
  byPlatform: PlatformRevocation | null = null
): Promise<boolean> {
  const prisma = getPrisma()
  const device = await prisma.device.findFirst({
    where: { id: deviceId, userId },
  })

  if (!device) {
    return false
  }

  await prisma.device.delete({ where: { id: device.id } })

  await recordEvent({
    action: "device.revoked",
    actorUserId: byPlatform?.actorUserId ?? userId,
    targetType: "device",
    targetId: device.id,
    payload: {
      fingerprint: device.fingerprint,
      name: device.name,
      ...(byPlatform ? { by_platform: true, reason: byPlatform.reason } : {}),
    },
  })

  return true
}
