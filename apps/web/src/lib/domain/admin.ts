import type { OrgRole } from "@pupitre/shared/permissions"
import { PLATFORM_ORGANIZATION_ID } from "@pupitre/shared/platform"
import { SERVER_STATUSES, type StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

export const MAX_REASON_LENGTH = 500

const ACTING_ROLES: OrgRole[] = ["owner", "admin"]

/**
 * The platform pages belong to the platform organisation: they open when it is
 * the active one, and only for its members. On any other organisation, even the
 * owner's own, the console shows that organisation and nothing of the platform.
 */
export function platformOpen(
  activeOrganizationId: string | null | undefined,
  platformRole: OrgRole | null
): boolean {
  return (
    platformRole !== null && activeOrganizationId === PLATFORM_ORGANIZATION_ID
  )
}

/**
 * Any member of the platform organisation reads these pages; only the two roles
 * the owner grants there act on them. The guards decide, this only hides.
 */
export function canActOnPlatform(role: OrgRole | null): boolean {
  return role !== null && ACTING_ROLES.includes(role)
}

const SUSPENDED_REASON_KEYS: Record<string, DictionaryKey> = {
  billing: "admin.servers.suspendedReason.billing",
  admin: "admin.servers.suspendedReason.admin",
}

export function suspendedReasonKey(
  reason: string | null
): DictionaryKey | null {
  return reason === null ? null : (SUSPENDED_REASON_KEYS[reason] ?? null)
}

/** The team suspends what is running; what is already stopped, or gone, has nothing to suspend. */
export function canSuspend(status: string): boolean {
  return status === "active"
}

/** Only the suspension the team laid is the team's to lift; non-payment lifts itself. */
export function canRestore(suspendedReason: string | null): boolean {
  return suspendedReason === "admin"
}

const CONFLICT = 409

/**
 * The platform refuses to ban a member of its own organisation. The refusal is
 * about who the account is, so retrying never changes it: the control closes.
 */
export function accountIsProtected(status: number | undefined): boolean {
  return status === CONFLICT
}

export const SUBSCRIPTION_STATUS_FILTERS = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
] as const

export const SUBSCRIPTION_PRODUCT_FILTERS = ["prod_server", "launch"] as const

const PRODUCT_KEYS: Record<string, DictionaryKey> = {
  launch: "admin.subscriptions.product.launch",
  prod_server: "admin.subscriptions.product.server",
}

export function productKey(product: string | null): DictionaryKey | null {
  return product === null ? null : (PRODUCT_KEYS[product] ?? null)
}

const CHANNEL_KEYS: Record<string, DictionaryKey> = {
  stable: "admin.releases.channel.stable",
  beta: "admin.releases.channel.beta",
}

export function channelKey(channel: string): DictionaryKey | null {
  return CHANNEL_KEYS[channel] ?? null
}

export interface ReleaseBuild {
  version: string
  channel: string
  /** Eden revives an ISO date into a `Date`; a fixture hands the string. */
  published_at: string | Date
}

export interface ReleaseVersion {
  version: string
  channels: string[]
  builds: number
  publishedAt: string
  stable: boolean
}

function instantOf(value: string | Date): number {
  return new Date(value).getTime()
}

function isoOf(value: string | Date): string {
  return new Date(value).toISOString()
}

/**
 * A version is published one artefact at a time; the page promotes a version,
 * so its artefacts are gathered back into one line, newest first.
 */
export function releaseVersions(builds: ReleaseBuild[]): ReleaseVersion[] {
  const versions = new Map<string, ReleaseVersion>()

  for (const build of builds) {
    const found = versions.get(build.version)

    if (found) {
      found.builds += 1
      found.publishedAt =
        instantOf(build.published_at) > instantOf(found.publishedAt)
          ? isoOf(build.published_at)
          : found.publishedAt

      if (!found.channels.includes(build.channel)) {
        found.channels.push(build.channel)
      }
    } else {
      versions.set(build.version, {
        version: build.version,
        channels: [build.channel],
        builds: 1,
        publishedAt: isoOf(build.published_at),
        stable: false,
      })
    }
  }

  return [...versions.values()]
    .map((version) => ({
      ...version,
      stable: version.channels.includes("stable"),
    }))
    .sort(
      (left, right) =>
        instantOf(right.publishedAt) - instantOf(left.publishedAt)
    )
}

export interface AdminUserState {
  banned: boolean
  email_verified: boolean
}

const BANNED: StatusLook = {
  shape: "barred",
  tone: "danger",
  label: "admin.users.banned",
}

const UNVERIFIED: StatusLook = {
  shape: "hollow",
  tone: "warn",
  label: "admin.users.unverified",
}

const ACTIVE: StatusLook = {
  shape: "filled",
  tone: "ok",
  label: "admin.users.active",
}

export function userLook({
  banned,
  email_verified,
}: AdminUserState): StatusLook {
  if (banned) {
    return BANNED
  }

  return email_verified ? ACTIVE : UNVERIFIED
}

export interface AdminOverview {
  users: number
  organizations: number
  servers: Record<string, number> & { total: number }
  subscriptions: Record<string, number> & { total: number }
  affiliate_links: number
  referrals: number
}

export interface OverviewPart {
  label: DictionaryKey
  value: number
}

export interface OverviewFigure {
  id: string
  label: DictionaryKey
  value: number
  parts: OverviewPart[]
}

const SERVER_PARTS: Record<(typeof SERVER_STATUSES)[number], DictionaryKey> = {
  enrolling: "status.enrolling",
  active: "status.active",
  grace: "status.grace",
  suspended: "status.suspended",
  revoked: "status.revoked",
}

/** The Stripe statuses a subscription can hold; the launch is a product, not one of them. */
const SUBSCRIPTION_PARTS: [string, DictionaryKey][] = [
  ["trialing", "billing.status.trialing"],
  ["active", "billing.status.active"],
  ["past_due", "billing.status.past_due"],
  ["canceled", "billing.status.canceled"],
  ["other", "admin.overview.other"],
]

/** The counts as the page lays them out: a figure, then its parts in the order the reader expects. */
export function overviewFigures(overview: AdminOverview): OverviewFigure[] {
  return [
    {
      id: "users",
      label: "admin.overview.users",
      value: overview.users,
      parts: [],
    },
    {
      id: "organizations",
      label: "admin.overview.organizations",
      value: overview.organizations,
      parts: [],
    },
    {
      id: "servers",
      label: "admin.overview.servers",
      value: overview.servers.total,
      parts: SERVER_STATUSES.map((status) => ({
        label: SERVER_PARTS[status],
        value: overview.servers[status] ?? 0,
      })),
    },
    {
      id: "subscriptions",
      label: "admin.overview.subscriptions",
      value: overview.subscriptions.total,
      parts: SUBSCRIPTION_PARTS.map(([status, label]) => ({
        label,
        value: overview.subscriptions[status] ?? 0,
      })),
    },
    {
      id: "launch",
      label: "admin.overview.launch",
      value: overview.subscriptions.launch ?? 0,
      parts: [],
    },
    {
      id: "affiliate_links",
      label: "admin.overview.affiliateLinks",
      value: overview.affiliate_links,
      parts: [],
    },
    {
      id: "referrals",
      label: "admin.overview.referrals",
      value: overview.referrals,
      parts: [],
    },
  ]
}
