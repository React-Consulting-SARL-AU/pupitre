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

/**
 * The four mailboxes the migration writes. Their identifiers are stable like
 * the organization's: a renamed one orphans the threads already attached.
 */
export const PLATFORM_MAILBOX_IDS = {
  support: "mbx_support",
  legal: "mbx_legal",
  privacy: "mbx_privacy",
  security: "mbx_security",
} as const

export type PlatformMailboxKey = keyof typeof PLATFORM_MAILBOX_IDS

export const PLATFORM_MAILBOX_ID_LIST = Object.values(PLATFORM_MAILBOX_IDS)

export function isPlatformMailboxId(value: string): boolean {
  return PLATFORM_MAILBOX_ID_LIST.includes(
    value as (typeof PLATFORM_MAILBOX_ID_LIST)[number]
  )
}

/** How many rows a platform page asks for, and the most it may ask for. */
export const ADMIN_PAGE_SIZE = 50

export const ADMIN_MAX_PAGE_SIZE = 200
