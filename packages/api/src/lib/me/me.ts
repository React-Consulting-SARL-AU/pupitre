import { type Locale, localeOrDefault } from "@pupitre/shared/i18n"
import type { OrgRole } from "@pupitre/shared/permissions"
import type { SessionUser } from "../api/plugins/auth"
import { getPrisma, withOrganization } from "../api/prisma"
import { entitlementForOrganization } from "../billing/entitlement"
import { countSeatedServers, seatQuotaFor } from "../billing/seats"
import { liveSubscriptionOf } from "../billing/subscription"
import {
  organizationReasonOf,
  organizationStateOf,
} from "../platform/lifecycle"

export interface MeInput {
  user: SessionUser
  organizationId: string | null
  role: OrgRole | null
  platformRole: OrgRole | null
}

export interface MeSubscriptionView {
  status: string
  trial_ends_at: Date | null
  current_period_end: Date | null
  servers: { used: number; limit: number }
}

/**
 * The subscription the app shows under the account: the Stripe mirror as it
 * stands, and the seats it pays against the servers that hold one. Stripe ends
 * the first period with the trial, so that date is the trial's end while the
 * status says so.
 */
export async function subscriptionForMe(
  organizationId: string
): Promise<MeSubscriptionView | null> {
  const scoped = withOrganization(getPrisma(), organizationId)
  const [subscription, used, { quota }] = await Promise.all([
    liveSubscriptionOf(organizationId),
    countSeatedServers(scoped),
    seatQuotaFor(scoped, organizationId),
  ])

  if (!subscription) {
    return null
  }

  return {
    status: subscription.status,
    trial_ends_at:
      subscription.status === "trialing" ? subscription.currentPeriodEnd : null,
    current_period_end: subscription.currentPeriodEnd,
    servers: { used, limit: quota },
  }
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
      select: { locale: true },
    }),
  ])
  const active =
    memberships.find(
      (membership) => membership.organizationId === organizationId
    )?.organization ?? null
  const [entitlement, subscription] = active
    ? await Promise.all([
        entitlementForOrganization(active.id).then((held) => held.state),
        subscriptionForMe(active.id),
      ])
    : ["none" as const, null]

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
    entitlement,
    subscription,
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
