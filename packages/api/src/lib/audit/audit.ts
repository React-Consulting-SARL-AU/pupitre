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
  | "server.restored"
  | "server.updated"
  | "server.alerts_cleared"
  | "backup.created"
  | "backup.deleted"
  | "backup.forgotten"
  | "backup.restored"
  | "member.invited"
  | "user.banned"
  | "user.unbanned"
  | "user.deactivated"
  | "user.reactivated"
  | "user.deleted"
  | "user.purged"
  | "user.purge_skipped"
  | "user.sessions_revoked"
  | "organization.suspended"
  | "organization.restored"
  | "organization.closed"
  | "organization.reopened"
  | "organization.deleted"
  | "organization.purged"
  | "organization.updated"
  | "organization.transferred"
  | "release.published"
  | "release.promoted"
  | "app_release.published"
  | "app_release.promoted"
  | "subscription.created"
  | "subscription.granted"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.deleted"
  | "seats.drifted"
  | "referral.recorded"
  | "affiliate_link.created"
  | "affiliate_link.updated"
  | "affiliate_link.deleted"
  | "mail.closed"
  | "mail.reopened"
  | "mail.assigned"
  | "mail.replied"
  | "mail.composed"
  | "mail.read"
  | "mail.attachment_read"
  | "mail.linked"
  | "mail.note_added"
  | "mail.note_deleted"
  | "mail.bulk_closed"
  | "mail.bulk_reopened"
  | "mail.bulk_read"
  | "mail.bulk_unread"
  | "mail.mailbox_created"
  | "mail.mailbox_updated"
  | "mail.mailbox_deleted"
  | "mail.template_created"
  | "mail.template_updated"
  | "mail.template_deleted"

export type AuditTargetType =
  | "device"
  | "server"
  | "backup"
  | "user"
  | "organization"
  | "release"
  | "app_release"
  | "subscription"
  | "invitation"
  | "affiliate_link"
  | "mail_thread"
  | "mail_mailbox"
  | "mail_template"

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
