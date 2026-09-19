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
  "user.deactivated",
  "user.reactivated",
  "user.deleted",
  "user.purged",
  "user.sessions_revoked",
  "organization.suspended",
  "organization.restored",
  "organization.closed",
  "organization.reopened",
  "organization.deleted",
  "organization.purged",
  "organization.updated",
  "organization.transferred",
  "server.restored",
  "mail.replied",
  "mail.composed",
  "mail.closed",
  "mail.reopened",
  "mail.assigned",
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
  "user.deactivated": "audit.action.user.deactivated",
  "user.reactivated": "audit.action.user.reactivated",
  "user.deleted": "audit.action.user.deleted",
  "user.purged": "audit.action.user.purged",
  "user.sessions_revoked": "audit.action.user.sessions_revoked",
  "organization.suspended": "audit.action.organization.suspended",
  "organization.restored": "audit.action.organization.restored",
  "organization.closed": "audit.action.organization.closed",
  "organization.reopened": "audit.action.organization.reopened",
  "organization.deleted": "audit.action.organization.deleted",
  "organization.purged": "audit.action.organization.purged",
  "organization.updated": "audit.action.organization.updated",
  "organization.transferred": "audit.action.organization.transferred",
  "server.restored": "audit.action.server.restored",
  "mail.replied": "audit.action.mail.replied",
  "mail.composed": "audit.action.mail.composed",
  "mail.closed": "audit.action.mail.closed",
  "mail.reopened": "audit.action.mail.reopened",
  "mail.assigned": "audit.action.mail.assigned",
}

export const AUDIT_TARGET_TYPES = [
  "server",
  "device",
  "invitation",
  "subscription",
  "release",
  "affiliate_link",
  "user",
  "organization",
  "mail_thread",
] as const

const TARGET_KEYS: Record<string, DictionaryKey> = {
  server: "audit.target.server",
  device: "audit.target.device",
  invitation: "audit.target.invitation",
  subscription: "audit.target.subscription",
  release: "audit.target.release",
  affiliate_link: "audit.target.affiliate_link",
  user: "audit.target.user",
  organization: "audit.target.organization",
  mail_thread: "audit.target.mail_thread",
}

/** A key when the action is one we name, and the raw action when it is not. */
export function actionKey(action: string): DictionaryKey | null {
  return ACTION_KEYS[action as AuditAction] ?? null
}

export function targetKey(targetType: string): DictionaryKey | null {
  return TARGET_KEYS[targetType] ?? null
}

export const EVENTS_PER_PAGE = 25
