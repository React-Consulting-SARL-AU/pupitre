// Seeded once and never regenerated: changing one of these ids orphans the rows already seeded.
export const PLATFORM_ORGANIZATION_ID = "org_pupitre"

export const PLATFORM_ORGANIZATION_SLUG = "pupitre"

export const PLATFORM_ORGANIZATION_NAME = "Pupitre"

export const PLATFORM_ADMIN_USER_ID = "usr_pupitre_admin"

export const PLATFORM_ADMIN_MEMBER_ID = "mem_pupitre_admin"

// Written by a migration: a renamed id orphans the threads already attached.
export const PLATFORM_MAILBOX_IDS = {
  support: "mbx_support",
  legal: "mbx_legal",
  privacy: "mbx_privacy",
  security: "mbx_security",
} as const

const PLATFORM_MAILBOX_ID_LIST = Object.values(PLATFORM_MAILBOX_IDS)

export function isPlatformMailboxId(value: string): boolean {
  return PLATFORM_MAILBOX_ID_LIST.includes(
    value as (typeof PLATFORM_MAILBOX_ID_LIST)[number]
  )
}

export const ADMIN_PAGE_SIZE = 50

export const ADMIN_MAX_PAGE_SIZE = 200

// A scheduled purge stays cancellable this long before the rows leave the database.
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

export const WORKLIST_ITEMS = 5

export const PLATFORM_SEARCH_MIN_LENGTH = 2

export const PLATFORM_SEARCH_MAX_LENGTH = 80

export const PLATFORM_SEARCH_RESULTS = 5
