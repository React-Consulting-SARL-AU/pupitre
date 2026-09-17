export interface MemberRemoved {
  organizationId: string
  userId: string
  memberId: string
}

export interface OrganizationHooks {
  onMemberRemoved?: (removed: MemberRemoved) => Promise<void>
}

let configured: OrganizationHooks = {}

/**
 * What the platform does when the organization changes shape, filled by the
 * API at import time: Better Auth removes the member, the servers they held
 * are the API's to release.
 */
export function configureOrganizationHooks(hooks: OrganizationHooks): void {
  configured = { ...configured, ...hooks }
}

export function organizationHooks(): OrganizationHooks {
  return configured
}
