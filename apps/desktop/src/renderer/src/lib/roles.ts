import type { DictionaryKey } from "@renderer/i18n/en";
import type { Translate } from "@renderer/i18n/i18n";

const ROLE_KEYS: Record<string, DictionaryKey> = {
  admin: "role.admin",
  member: "role.member",
  owner: "role.owner",
};

/** The role in the reader's language; a role the app does not know, as said. */
export function roleLabel(t: Translate, role: string): string {
  const key = ROLE_KEYS[role];

  return key ? t(key) : role;
}
