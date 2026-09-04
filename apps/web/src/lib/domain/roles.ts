import type { OrgRole } from "@pupitre/shared/permissions"

export const INVITABLE_ROLES: OrgRole[] = ["member", "admin"]

export const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Voit tout, attribue, et gère seul la facturation.",
  admin: "Voit tous les serveurs, attribue, invite, lit le journal.",
  member: "Ne voit que les serveurs qui lui sont attribués.",
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

export function roleDescription(role: string): string {
  return ROLE_DESCRIPTIONS[role] ?? ""
}
