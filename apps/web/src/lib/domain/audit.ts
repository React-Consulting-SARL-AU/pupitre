import type { DictionaryKey } from "@/lib/i18n/en"

export const AUDIT_ACTIONS = [
  "server.enrolled",
  "server.exchanged",
  "server.assigned",
  "server.unassigned",
  "server.device_revoked",
  "server.deleted",
  "device.added",
  "device.revoked",
  "member.invited",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.granted",
  "subscription.deleted",
  "referral.recorded",
  "affiliate_link.created",
  "affiliate_link.updated",
  "user.banned",
  "user.unbanned",
  "server.restored",
  "mail.replied",
  "mail.composed",
  "mail.closed",
  "mail.reopened",
  "mail.assigned",
  "mail.read",
  "mail.attachment_read",
  "mail.linked",
  "mail.note_added",
  "mail.note_deleted",
  "mail.bulk_closed",
  "mail.bulk_read",
  "mail.mailbox_created",
  "mail.mailbox_updated",
  "mail.mailbox_deleted",
  "mail.template_created",
  "mail.template_updated",
  "mail.template_deleted",
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

const ACTION_KEYS: Record<AuditAction, DictionaryKey> = {
  "server.enrolled": "audit.action.server.enrolled",
  "server.exchanged": "audit.action.server.exchanged",
  "server.assigned": "audit.action.server.assigned",
  "server.unassigned": "audit.action.server.unassigned",
  "server.device_revoked": "audit.action.server.device_revoked",
  "server.deleted": "audit.action.server.deleted",
  "device.added": "audit.action.device.added",
  "device.revoked": "audit.action.device.revoked",
  "member.invited": "audit.action.member.invited",
  "subscription.created": "audit.action.subscription.created",
  "subscription.updated": "audit.action.subscription.updated",
  "subscription.canceled": "audit.action.subscription.canceled",
  "subscription.granted": "audit.action.subscription.granted",
  "subscription.deleted": "audit.action.subscription.deleted",
  "referral.recorded": "audit.action.referral.recorded",
  "affiliate_link.created": "audit.action.affiliate_link.created",
  "affiliate_link.updated": "audit.action.affiliate_link.updated",
  "user.banned": "audit.action.user.banned",
  "user.unbanned": "audit.action.user.unbanned",
  "server.restored": "audit.action.server.restored",
  "mail.replied": "audit.action.mail.replied",
  "mail.composed": "audit.action.mail.composed",
  "mail.closed": "audit.action.mail.closed",
  "mail.reopened": "audit.action.mail.reopened",
  "mail.assigned": "audit.action.mail.assigned",
  "mail.read": "audit.action.mail.read",
  "mail.attachment_read": "audit.action.mail.attachment_read",
  "mail.linked": "audit.action.mail.linked",
  "mail.note_added": "audit.action.mail.note_added",
  "mail.note_deleted": "audit.action.mail.note_deleted",
  "mail.bulk_closed": "audit.action.mail.bulk_closed",
  "mail.bulk_read": "audit.action.mail.bulk_read",
  "mail.mailbox_created": "audit.action.mail.mailbox_created",
  "mail.mailbox_updated": "audit.action.mail.mailbox_updated",
  "mail.mailbox_deleted": "audit.action.mail.mailbox_deleted",
  "mail.template_created": "audit.action.mail.template_created",
  "mail.template_updated": "audit.action.mail.template_updated",
  "mail.template_deleted": "audit.action.mail.template_deleted",
}

export const AUDIT_TARGET_TYPES = [
  "server",
  "device",
  "invitation",
  "subscription",
  "release",
  "affiliate_link",
  "user",
  "mail_thread",
  "mail_mailbox",
  "mail_template",
] as const

const TARGET_KEYS: Record<string, DictionaryKey> = {
  server: "audit.target.server",
  device: "audit.target.device",
  invitation: "audit.target.invitation",
  subscription: "audit.target.subscription",
  release: "audit.target.release",
  affiliate_link: "audit.target.affiliate_link",
  user: "audit.target.user",
  mail_thread: "audit.target.mail_thread",
  mail_mailbox: "audit.target.mail_mailbox",
  mail_template: "audit.target.mail_template",
}

/** A key when the action is one we name, and the raw action when it is not. */
export function actionKey(action: string): DictionaryKey | null {
  return ACTION_KEYS[action as AuditAction] ?? null
}

export function targetKey(targetType: string): DictionaryKey | null {
  return TARGET_KEYS[targetType] ?? null
}

export const EVENTS_PER_PAGE = 25
