import type { AccountState, OrganizationState } from "@pupitre/shared/platform"

export interface AccountStanding {
  banned: boolean | null
  banExpires: Date | null
  deactivatedAt: Date | null
  deletionAt: Date | null
}

export interface OrganizationStanding {
  suspendedAt: Date | null
  closedAt: Date | null
  deletionAt: Date | null
}

/** A ban whose end has passed no longer holds: the account is active again without anybody lifting it. */
export function isBanned(
  account: Pick<AccountStanding, "banned" | "banExpires">,
  now: Date = new Date()
): boolean {
  if (!account.banned) {
    return false
  }

  return (
    account.banExpires === null || account.banExpires.getTime() > now.getTime()
  )
}

export function accountStateOf(
  account: AccountStanding,
  now: Date = new Date()
): AccountState {
  if (account.deletionAt) {
    return "deleting"
  }

  if (account.deactivatedAt) {
    return "deactivated"
  }

  return isBanned(account, now) ? "suspended" : "active"
}

export function organizationStateOf(
  organization: OrganizationStanding
): OrganizationState {
  if (organization.deletionAt) {
    return "deleting"
  }

  if (organization.closedAt) {
    return "closed"
  }

  return organization.suspendedAt ? "suspended" : "active"
}

/** What the member reads on a state the platform laid down, and nothing else. */
export function organizationReasonOf(
  organization: OrganizationStanding & {
    suspendedReason: string | null
    closedReason: string | null
    deletionReason: string | null
  }
): string | null {
  const state = organizationStateOf(organization)

  if (state === "deleting") {
    return organization.deletionReason
  }

  if (state === "closed") {
    return organization.closedReason
  }

  return state === "suspended" ? organization.suspendedReason : null
}

export const ORGANIZATION_LIFECYCLE_SELECT = {
  suspendedAt: true,
  suspendedReason: true,
  suspendedByUserId: true,
  closedAt: true,
  closedReason: true,
  closedByUserId: true,
  deletionAt: true,
  deletionReason: true,
  deletionByUserId: true,
} as const

export const ACCOUNT_LIFECYCLE_SELECT = {
  banned: true,
  banReason: true,
  banExpires: true,
  deactivatedAt: true,
  deactivatedReason: true,
  deactivatedByUserId: true,
  deletionAt: true,
  deletionReason: true,
  deletionByUserId: true,
} as const
