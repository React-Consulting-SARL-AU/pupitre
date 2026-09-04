import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

export type AuditAction =
  | "device.added"
  | "device.revoked"
  | "server.enrolled"
  | "server.exchanged"
  | "server.deleted"
  | "server.assigned"
  | "server.unassigned"
  | "server.device_revoked"
  | "member.invited"
  | "release.published"
  | "release.promoted"
  | "app_release.published"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"

export type AuditTargetType =
  | "device"
  | "server"
  | "release"
  | "app_release"
  | "subscription"
  | "invitation"

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
