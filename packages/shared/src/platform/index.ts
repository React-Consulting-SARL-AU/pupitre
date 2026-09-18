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
