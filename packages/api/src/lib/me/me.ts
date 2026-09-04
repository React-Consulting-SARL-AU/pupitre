import type { OrgRole } from "@pupitre/shared/permissions"
import type { SessionUser } from "../api/plugins/auth"
import { getPrisma } from "../api/prisma"
import { entitlementForOrganization } from "../billing/entitlement"

export interface MeInput {
  user: SessionUser
  organizationId: string | null
  role: OrgRole | null
}

export async function loadMe({ user, organizationId, role }: MeInput) {
  const memberships = await getPrisma().member.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  })
  const active =
    memberships.find(
      (membership) => membership.organizationId === organizationId
    )?.organization ?? null
  const entitlement = active
    ? (await entitlementForOrganization(active.id)).state
    : ("none" as const)

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      created_at: user.createdAt,
    },
    organizations: memberships.map(({ organization, role: memberRole }) => ({
      ...organization,
      role: memberRole,
    })),
    active_organization: active,
    role,
    entitlement,
  }
}
