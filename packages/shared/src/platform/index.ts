/**
 * Pupitre's own organization and its administrator. These identifiers are
 * written into the database by `bun run db:seed` and never regenerated:
 * changing one of them orphans the rows already seeded.
 */

export const PLATFORM_ORGANIZATION_ID = "org_pupitre"

export const PLATFORM_ORGANIZATION_SLUG = "pupitre"

export const PLATFORM_ORGANIZATION_NAME = "Pupitre"

export const PLATFORM_ADMIN_USER_ID = "usr_pupitre_admin"

export const PLATFORM_ADMIN_MEMBER_ID = "mem_pupitre_admin"

/** How many rows a platform page asks for, and the most it may ask for. */
export const ADMIN_PAGE_SIZE = 50

export const ADMIN_MAX_PAGE_SIZE = 200

/** How long a scheduled purge stays cancellable before the rows leave the database. */
export const DELETION_GRACE_DAYS = 7

export const ACCOUNT_STATES = [
  "active",
  "suspended",
  "deactivated",
  "deleting",
] as const

export type AccountState = (typeof ACCOUNT_STATES)[number]

export const ORGANIZATION_STATES = [
  "active",
  "suspended",
  "closed",
  "deleting",
] as const

export type OrganizationState = (typeof ORGANIZATION_STATES)[number]

export function deletionDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + DELETION_GRACE_DAYS * 86_400_000)
}
