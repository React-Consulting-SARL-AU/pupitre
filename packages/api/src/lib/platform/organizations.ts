import type { Prisma, Subscription } from "@pupitre/db/cloudflare/client"
import { isPlatformProduct } from "@pupitre/shared/plans"
import { ADMIN_MAX_PAGE_SIZE } from "@pupitre/shared/platform"
import { getPrisma } from "../api/prisma"
import { liveAmong } from "../billing/subscription"
import { type AdminServerView, listServersForPlatform } from "../servers/admin"
import { type AdminEventView, recentEvents } from "./events"

export interface AdminOrganizationSubscription {
  status: string
  product: string
  quantity: number
  current_period_end: Date | null
}

export interface AdminOrganizationReferral {
  code: string
  name: string
}

export interface AdminOrganizationView {
  id: string
  name: string
  slug: string
  personal: boolean
  created_at: Date
  members: number
  servers: number
  subscription: AdminOrganizationSubscription | null
  referral: AdminOrganizationReferral | null
}

export interface AdminOrganizationMember {
  user_id: string
  email: string
  name: string
  role: string
  created_at: Date
}

export interface AdminOrganizationSubscriptionRow {
  id: string
  stripe_subscription_id: string
  product: string
  quantity: number
  status: string
  current_period_end: Date | null
  note: string | null
  /** True for a product Stripe never sees: the launch, or what the team granted. */
  platform: boolean
  created_at: Date
  updated_at: Date
}

export interface AdminOrganizationDetail
  extends Omit<AdminOrganizationView, "members" | "servers"> {
  members: AdminOrganizationMember[]
  servers: AdminServerView[]
  subscriptions: AdminOrganizationSubscriptionRow[]
  events: AdminEventView[]
}

export interface AdminOrganizationFilter {
  q?: string
  limit: number
  offset: number
}

export interface AdminOrganizationPage {
  data: AdminOrganizationView[]
  total: number
}

const ORGANIZATION_INCLUDE = {
  _count: { select: { members: true, servers: true } },
  referral: { include: { link: { select: { code: true, name: true } } } },
} as const

type OrganizationRow = Prisma.OrganizationGetPayload<{
  include: typeof ORGANIZATION_INCLUDE
}>

/** The organizations a sign-up creates carry `personal: true` in their Better Auth metadata. */
function isPersonal(metadata: string | null): boolean {
  if (!metadata) {
    return false
  }

  try {
    return (JSON.parse(metadata) as { personal?: unknown }).personal === true
  } catch {
    return false
  }
}

function toSubscriptionSummary(
  subscription: Subscription | null
): AdminOrganizationSubscription | null {
  return subscription
    ? {
        status: subscription.status,
        product: subscription.product,
        quantity: subscription.quantity,
        current_period_end: subscription.currentPeriodEnd,
      }
    : null
}

export function toSubscriptionRow(
  subscription: Subscription
): AdminOrganizationSubscriptionRow {
  return {
    id: subscription.id,
    stripe_subscription_id: subscription.stripeSubscriptionId,
    product: subscription.product,
    quantity: subscription.quantity,
    status: subscription.status,
    current_period_end: subscription.currentPeriodEnd,
    note: subscription.note,
    platform: isPlatformProduct(subscription.product),
    created_at: subscription.createdAt,
    updated_at: subscription.updatedAt,
  }
}

async function liveByOrganization(
  organizationIds: string[]
): Promise<Map<string, Subscription>> {
  if (organizationIds.length === 0) {
    return new Map()
  }

  const rows = await getPrisma().subscription.findMany({
    where: { organizationId: { in: organizationIds } },
    orderBy: { updatedAt: "desc" },
  })
  const byOrganization = new Map<string, Subscription[]>()

  for (const row of rows) {
    const kept = byOrganization.get(row.organizationId) ?? []

    kept.push(row)
    byOrganization.set(row.organizationId, kept)
  }

  const live = new Map<string, Subscription>()

  for (const [organizationId, subscriptions] of byOrganization) {
    const counted = liveAmong(subscriptions)

    if (counted) {
      live.set(organizationId, counted)
    }
  }

  return live
}

function toView(
  organization: OrganizationRow,
  subscription: Subscription | null
): AdminOrganizationView {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    personal: isPersonal(organization.metadata),
    created_at: organization.createdAt,
    members: organization._count.members,
    servers: organization._count.servers,
    subscription: toSubscriptionSummary(subscription),
    referral: organization.referral
      ? {
          code: organization.referral.link.code,
          name: organization.referral.link.name,
        }
      : null,
  }
}

function whereOf(
  filter: AdminOrganizationFilter
): Prisma.OrganizationWhereInput {
  const q = filter.q?.trim()

  return q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] } : {}
}

export async function listOrganizationsForPlatform(
  filter: AdminOrganizationFilter
): Promise<AdminOrganizationPage> {
  const prisma = getPrisma()
  const where = whereOf(filter)
  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit,
      skip: filter.offset,
      include: ORGANIZATION_INCLUDE,
    }),
    prisma.organization.count({ where }),
  ])
  const live = await liveByOrganization(
    organizations.map((organization) => organization.id)
  )

  return {
    data: organizations.map((organization) =>
      toView(organization, live.get(organization.id) ?? null)
    ),
    total,
  }
}

export async function readOrganizationForPlatform(
  organizationId: string
): Promise<AdminOrganizationDetail | null> {
  const prisma = getPrisma()
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: ORGANIZATION_INCLUDE,
  })

  if (!organization) {
    return null
  }

  const [members, subscriptions, servers, events] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.subscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    }),
    listServersForPlatform({
      organization_id: organizationId,
      limit: ADMIN_MAX_PAGE_SIZE,
      offset: 0,
    }),
    recentEvents({ organizationId }),
  ])

  const byLastTouch = [...subscriptions].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
  )

  return {
    ...toView(organization, liveAmong(byLastTouch)),
    members: members.map((member) => ({
      user_id: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      created_at: member.createdAt,
    })),
    servers: servers.data,
    subscriptions: subscriptions.map(toSubscriptionRow),
    events,
  }
}
