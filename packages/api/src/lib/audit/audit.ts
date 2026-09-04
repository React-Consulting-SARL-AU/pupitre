import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

export type AuditAction =
  | "device.added"
  | "device.revoked"
  | "server.enrolled"
  | "server.exchanged"
  | "server.deleted"

export type AuditTargetType = "device" | "server"

export interface AuditEntry {
  action: AuditAction
  actorUserId: string | null
  organizationId?: string | null
  targetType: AuditTargetType
  targetId: string
  payload?: Prisma.InputJsonValue
}

export async function recordEvent(entry: AuditEntry): Promise<void> {
  await getPrisma().event.create({
    data: {
      action: entry.action,
      actorUserId: entry.actorUserId,
      organizationId: entry.organizationId ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      payload: entry.payload,
    },
  })
}
