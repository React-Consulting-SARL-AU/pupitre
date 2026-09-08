import type { OrgRole } from "@pupitre/shared/permissions"

export const MAX_ORGANIZATION_NAME_LENGTH = 60

export const MAX_SLUG_LENGTH = 48

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const DIACRITIC_RE = /\p{Diacritic}/gu
const SEPARATOR_RE = /[^a-z0-9]+/g
const EDGE_DASH_RE = /^-+|-+$/g

const MANAGING_ROLES: readonly OrgRole[] = ["owner", "admin"]

export function canManageOrganization(role: OrgRole | null): boolean {
  return role !== null && MANAGING_ROLES.includes(role)
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITIC_RE, "")
    .toLowerCase()
    .replace(SEPARATOR_RE, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(EDGE_DASH_RE, "")
}

export function organizationSlugFor(name: string): string {
  return slugify(name) || `org-${Date.now().toString(36)}`
}

export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?"
}
