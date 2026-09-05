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
}

const TARGET_KEYS: Record<string, DictionaryKey> = {
  server: "audit.target.server",
  device: "audit.target.device",
  invitation: "audit.target.invitation",
  subscription: "audit.target.subscription",
  release: "audit.target.release",
}

/** A key when the action is one we name, and the raw action when it is not. */
export function actionKey(action: string): DictionaryKey | null {
  return ACTION_KEYS[action as AuditAction] ?? null
}

export function targetKey(targetType: string): DictionaryKey | null {
  return TARGET_KEYS[targetType] ?? null
}

export const EVENTS_PER_PAGE = 25
