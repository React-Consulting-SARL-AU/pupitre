import type { OrgRole } from "@pupitre/shared/permissions"
import type { DictionaryKey } from "@/lib/i18n/en"

export const INVITABLE_ROLES: OrgRole[] = ["member", "admin"]

const ROLE_KEYS: Record<string, DictionaryKey> = {
  owner: "role.owner",
  admin: "role.admin",
  member: "role.member",
}

const DESCRIPTION_KEYS: Record<string, DictionaryKey> = {
  owner: "role.owner.description",
  admin: "role.admin.description",
  member: "role.member.description",
}

export function roleKey(role: string): DictionaryKey | null {
  return ROLE_KEYS[role] ?? null
}

export function roleDescriptionKey(role: string): DictionaryKey | null {
  return DESCRIPTION_KEYS[role] ?? null
}
