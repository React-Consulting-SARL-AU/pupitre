import { type Locale, localeOrDefault } from "@pupitre/shared/i18n"
import type { OrgRole } from "@pupitre/shared/permissions"
import type { SessionUser } from "../api/plugins/auth"
import { getPrisma, withOrganization } from "../api/prisma"
import { licenseForOrganization } from "../billing/license"
import {
  countSeatedServers,
  payingSubscriptionOf,
  seatQuotaFor,
} from "../billing/seats"
import { actsOnPlatform } from "../platform/actor"
import {
  organizationReasonOf,
  organizationStateOf,
} from "../platform/lifecycle"
import { dataConsentOf } from "./data-consent"

export interface MeInput {
  user: SessionUser
  organizationId: string | null
  role: OrgRole | null
  platformRole: OrgRole | null
}

export interface MeServersView {
  used: number
  limit: number
}

export interface MeLicenseGrantView {
  status: string
  seats: number
  current_period_end: Date | null
}

export async function serversForMe(
  organizationId: string
): Promise<MeServersView> {
  const scoped = withOrganization(getPrisma(), organizationId)
  const [used, limit] = await Promise.all([
    countSeatedServers(scoped),
    seatQuotaFor(scoped, organizationId),
  ])

  return { used, limit }
}

export async function licenseGrantForMe(
  organizationId: string
): Promise<MeLicenseGrantView | null> {
  const subscription = await payingSubscriptionOf(organizationId)

  if (!subscription) {
    return null
  }

  return {
    status: subscription.status,
    seats: subscription.quantity,
    current_period_end: subscription.currentPeriodEnd,
  }
}

async function activeLicenseOf(organizationId: string) {
  const [license, servers, grant] = await Promise.all([
    licenseForOrganization(organizationId).then((held) => held.state),
    serversForMe(organizationId),
    licenseGrantForMe(organizationId),
  ])

  return { license, servers, grant }
}

export async function loadMe({
  user,
  organizationId,
  role,
  platformRole,
}: MeInput) {
  const prisma = getPrisma()
  const [memberships, stored] = await Promise.all([
    prisma.member.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            suspendedAt: true,
            suspendedReason: true,
            closedAt: true,
            closedReason: true,
            deletionAt: true,
            deletionReason: true,
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { locale: true, dataConsentVersion: true, dataConsentAt: true },
    }),
  ])

  const active =
    memberships.find(
      (membership) => membership.organizationId === organizationId
    )?.organization ?? null
  const { license, servers, grant } = active
    ? await activeLicenseOf(active.id)
    : { license: "none" as const, servers: null, grant: null }

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
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      state: organizationStateOf(organization),
      role: memberRole,
    })),
    active_organization: active
      ? {
          id: active.id,
          name: active.name,
          slug: active.slug,
          state: organizationStateOf(active),
          reason: organizationReasonOf(active),
        }
      : null,
    role,
    platform_role: platformRole,
    platform_can_act: actsOnPlatform(platformRole),
    license,
    servers,
    license_grant: grant,
    data_consent: stored ? dataConsentOf(stored) : null,
    entitlement: license,
    subscription: null,
  }
}

// Only this session switches, and a non-member is refused without learning whether the organization exists.
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
