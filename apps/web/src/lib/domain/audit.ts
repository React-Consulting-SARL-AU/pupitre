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
  "affiliate_link.deleted",
  "user.banned",
  "user.unbanned",
  "server.restored",
  "server.updated",
  "server.alerts_cleared",
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
  "affiliate_link.deleted": "audit.action.affiliate_link.deleted",
  "user.banned": "audit.action.user.banned",
  "user.unbanned": "audit.action.user.unbanned",
  "server.restored": "audit.action.server.restored",
  "server.updated": "audit.action.server.updated",
  "server.alerts_cleared": "audit.action.server.alerts_cleared",
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
