import type { Prisma } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"

export type AuditAction =
  | "device.added"
  | "device.revoked"
  | "server.enrolled"
  | "server.exchanged"
  | "server.deleted"
  | "server.purged"
  | "server.assigned"
  | "server.unassigned"
  | "server.device_revoked"
  | "server.suspended"
  | "member.invited"
  | "release.published"
  | "release.promoted"
  | "app_release.published"
  | "app_release.promoted"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "seats.drifted"

export type AuditTargetType =
  | "device"
  | "server"
  | "release"
  | "app_release"
  | "subscription"
  | "invitation"

/**
 * Who did the thing.
 *
 * The console acts as a person; the release pipeline acts as itself, and has no
 * user to name. The journal keeps both apart rather than lending the pipeline
 * the account whose credential it once borrowed.
 */
export type ActorSource = "console" | "pipeline"

export interface Actor {
  userId: string | null
  source: ActorSource
}

export const PIPELINE_ACTOR: Actor = { userId: null, source: "pipeline" }

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
