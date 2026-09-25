export interface MemberRemoved {
  organizationId: string
  userId: string
  memberId: string
}

export interface OrganizationHooks {
  onMemberRemoved?: (removed: MemberRemoved) => Promise<void>
}

let configured: OrganizationHooks = {}

export function configureOrganizationHooks(hooks: OrganizationHooks): void {
  configured = { ...configured, ...hooks }
}

export function organizationHooks(): OrganizationHooks {
  return configured
}

export interface AccountDeletion {
  userId: string
  acceptLanguage: string | null
}

export interface AccountDeletionRefusal {
  code: string
  message: string
  fix: string
}

export interface AccountHooks {
  onAccountDeleting: (
    deletion: AccountDeletion
  ) => Promise<AccountDeletionRefusal | null>
}

let accountConfigured: AccountHooks | null = null

/** Better Auth only drops the user row; the API must refuse or purge platform data first. */
export function configureAccountHooks(hooks: AccountHooks): void {
  accountConfigured = hooks
}

export function accountHooks(): AccountHooks | null {
  return accountConfigured
}
