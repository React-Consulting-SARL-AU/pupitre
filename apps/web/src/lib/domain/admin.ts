import type { OrgRole } from "@pupitre/shared/permissions"
import {
  GRANTED_PRODUCT,
  LAUNCH_PRODUCT,
  STRIPE_PRODUCT,
} from "@pupitre/shared/plans"
import {
  type AccountState,
  type OrganizationState,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
import { SERVER_STATUSES } from "@pupitre/shared/platform-api"
import type { StatusLook } from "@/lib/domain/server-status"
import type { DictionaryKey } from "@/lib/i18n/en"

export const MAX_REASON_LENGTH = 500

export function platformOpen(
  activeOrganizationId: string | null | undefined,
  platformRole: OrgRole | null
): boolean {
  return (
    platformRole !== null && activeOrganizationId === PLATFORM_ORGANIZATION_ID
  )
}

export function isPlatformOrganization(
  organizationId: string | null | undefined
): boolean {
  return organizationId === PLATFORM_ORGANIZATION_ID
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

export const SUBSCRIPTION_STATUS_FILTERS = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
] as const

export const SUBSCRIPTION_PRODUCT_FILTERS = [
  LAUNCH_PRODUCT,
  GRANTED_PRODUCT,
  STRIPE_PRODUCT,
] as const

const PRODUCT_KEYS: Record<string, DictionaryKey> = {
  [LAUNCH_PRODUCT]: "admin.subscriptions.product.launch",
  [GRANTED_PRODUCT]: "admin.subscriptions.product.granted",
  [STRIPE_PRODUCT]: "admin.subscriptions.product.stripe",
}

// Stripe names its own products: any unknown product is a Stripe one.
export function productKey(product: string | null): DictionaryKey | null {
  if (product === null) {
    return null
  }

  return PRODUCT_KEYS[product] ?? PRODUCT_KEYS[STRIPE_PRODUCT]
}

const STRIPE_EVENT_STATUS_KEYS: Record<string, DictionaryKey> = {
  processing: "admin.subscriptions.eventStatus.processing",
  processed: "admin.subscriptions.eventStatus.processed",
  failed: "admin.subscriptions.eventStatus.failed",
}

export function stripeEventStatusKey(status: string): DictionaryKey | null {
  return STRIPE_EVENT_STATUS_KEYS[status] ?? null
}

export interface GrantTarget {
  organizationId: string
  hasLive: boolean
}

export function canGrantSubscription({
  organizationId,
  hasLive,
}: GrantTarget): boolean {
  return !(isPlatformOrganization(organizationId) || hasLive)
}

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Local end of day, so the right of use covers the whole picked day.
export function endOfDayIso(date: string): string | null {
  const parts = DATE_INPUT_RE.exec(date)

  if (!parts) {
    return null
  }

  const end = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
    23,
    59,
    59,
    999
  )

  return Number.isNaN(end.getTime()) ? null : end.toISOString()
}

export function dateInputValue(value: string | Date | null): string {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${date.getFullYear()}-${month}-${day}`
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
  // Eden revives an ISO date into a `Date`; a fixture hands the string.
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

const ACCOUNT_LOOKS: Record<AccountState, StatusLook> = {
  active: { shape: "filled", tone: "ok", label: "admin.users.state.active" },
  suspended: {
    shape: "barred",
    tone: "danger",
    label: "admin.users.state.suspended",
  },
  deactivated: {
    shape: "hollow",
    tone: "warn",
    label: "admin.users.state.deactivated",
  },
  deleting: {
    shape: "barred",
    tone: "danger",
    label: "admin.users.state.deleting",
  },
}

export function accountLook(state: string): StatusLook {
  return ACCOUNT_LOOKS[state as AccountState] ?? ACCOUNT_LOOKS.active
}

const ORGANIZATION_LOOKS: Record<OrganizationState, StatusLook> = {
  active: {
    shape: "filled",
    tone: "ok",
    label: "admin.organizations.state.active",
  },
  suspended: {
    shape: "barred",
    tone: "danger",
    label: "admin.organizations.state.suspended",
  },
  closed: {
    shape: "hollow",
    tone: "warn",
    label: "admin.organizations.state.closed",
  },
  deleting: {
    shape: "barred",
    tone: "danger",
    label: "admin.organizations.state.deleting",
  },
}

export function organizationLook(state: string): StatusLook {
  return (
    ORGANIZATION_LOOKS[state as OrganizationState] ?? ORGANIZATION_LOOKS.active
  )
}

export type AccountGesture =
  | "suspend"
  | "unsuspend"
  | "deactivate"
  | "reactivate"
  | "delete"
  | "purge"
  | "cancel_deletion"
  | "revoke_sessions"

export function accountGestures(state: string): AccountGesture[] {
  if (state === "deleting") {
    return ["cancel_deletion", "purge", "revoke_sessions"]
  }

  if (state === "deactivated") {
    return ["reactivate", "delete", "revoke_sessions"]
  }

  if (state === "suspended") {
    return ["unsuspend", "deactivate", "delete", "revoke_sessions"]
  }

  return ["suspend", "deactivate", "delete", "revoke_sessions"]
}

export type OrganizationGesture =
  | "suspend"
  | "restore"
  | "close"
  | "reopen"
  | "delete"
  | "purge"
  | "cancel_deletion"

export function organizationGestures(state: string): OrganizationGesture[] {
  if (state === "deleting") {
    return ["cancel_deletion", "purge"]
  }

  if (state === "closed") {
    return ["reopen", "delete"]
  }

  if (state === "suspended") {
    return ["restore", "close", "delete"]
  }

  return ["suspend", "close", "delete"]
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

// The launch is a product, not a status: it has its own figure.
const SUBSCRIPTION_PARTS: [string, DictionaryKey][] = [
  ["trialing", "billing.status.trialing"],
  ["active", "billing.status.active"],
  ["past_due", "billing.status.past_due"],
  ["canceled", "billing.status.canceled"],
  ["other", "admin.overview.other"],
]

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
