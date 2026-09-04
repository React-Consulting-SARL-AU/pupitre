import type { Device } from "@pupitre/db/cloudflare/client"
import { sendDeviceAddedEmail } from "../../emails/notifications"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { readEd25519PublicKey } from "./public-keys"

export class DeviceAlreadyExistsError extends Error {
  readonly fingerprint: string

  constructor(fingerprint: string) {
    super(`a device already carries ${fingerprint}`)
    this.name = "DeviceAlreadyExistsError"
    this.fingerprint = fingerprint
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

export async function addDevice(
  userId: string,
  input: DeviceInput,
  acceptLanguage: string | null = null
): Promise<DeviceView> {
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

export async function removeDevice(
  userId: string,
  deviceId: string
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
    actorUserId: userId,
    targetType: "device",
    targetId: device.id,
    payload: { fingerprint: device.fingerprint, name: device.name },
  })

  return true
}
