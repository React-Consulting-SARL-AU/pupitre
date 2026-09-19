const nullableDate = { type: "date", required: false, input: false } as const

const nullableString = {
  type: "string",
  required: false,
  input: false,
} as const

/**
 * What the platform writes above a live account: a lasting closure, and a
 * purge it has scheduled. A sanction stays on Better Auth's own `banned`.
 */
export const LIFECYCLE_FIELDS = {
  deactivatedAt: nullableDate,
  deactivatedReason: nullableString,
  deactivatedByUserId: nullableString,
  deletionAt: nullableDate,
  deletionReason: nullableString,
  deletionByUserId: nullableString,
}

export const ORGANIZATION_LIFECYCLE_FIELDS = {
  suspendedAt: nullableDate,
  suspendedReason: nullableString,
  suspendedByUserId: nullableString,
  closedAt: nullableDate,
  closedReason: nullableString,
  closedByUserId: nullableString,
  deletionAt: nullableDate,
  deletionReason: nullableString,
  deletionByUserId: nullableString,
}

export const ACCOUNT_DEACTIVATED_CODE = "ACCOUNT_DEACTIVATED"

export interface AccountLifecycle {
  deactivatedAt?: Date | string | null
  deletionAt?: Date | string | null
}

export function isAccountClosed(account: AccountLifecycle): boolean {
  return Boolean(account.deactivatedAt) || Boolean(account.deletionAt)
}
