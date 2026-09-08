import { type Locale, localeOrDefault } from "@pupitre/shared/i18n"
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
  const prisma = getPrisma()
  const [memberships, stored] = await Promise.all([
    prisma.member.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { locale: true },
    }),
  ])
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
      locale: localeOrDefault(stored?.locale),
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

/**
 * The active organization of this session, and this session alone.
 *
 * The console next to it keeps its own: the switch only affects the device
 * that requested it. An organization the caller isn't a member of is refused
 * without saying whether it exists.
 */
export async function setActiveOrganization(
  userId: string,
  sessionId: string,
  organizationId: string
): Promise<boolean> {
  const prisma = getPrisma()

  const membership = await prisma.member.findFirst({
    where: { userId, organizationId },
    select: { id: true },
  })

  if (!membership) {
    return false
  }

  await prisma.session.updateMany({
    where: { id: sessionId, userId },
    data: { activeOrganizationId: organizationId },
  })

  return true
}

export async function setUserLocale(
  userId: string,
  locale: Locale
): Promise<void> {
  await getPrisma().user.update({
    where: { id: userId },
    data: { locale },
  })
}
