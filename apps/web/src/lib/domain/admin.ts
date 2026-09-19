import type { OrgRole } from "@pupitre/shared/permissions"
import { GRANTED_PRODUCT, isPlatformProduct } from "@pupitre/shared/plans"
import {
  type AccountState,
  type OrganizationState,
  PLATFORM_ORGANIZATION_ID,
} from "@pupitre/shared/platform"
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

/** The platform organisation has no trial, no subscription and no onboarding: its right of use is permanent. */
export function isPlatformOrganization(
  organizationId: string | null | undefined
): boolean {
  return organizationId === PLATFORM_ORGANIZATION_ID
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

export const SUBSCRIPTION_STATUS_FILTERS = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
] as const

export const SUBSCRIPTION_PRODUCT_FILTERS = [
  "prod_server",
  "launch",
  GRANTED_PRODUCT,
] as const

const PRODUCT_KEYS: Record<string, DictionaryKey> = {
  launch: "admin.subscriptions.product.launch",
  prod_server: "admin.subscriptions.product.server",
  [GRANTED_PRODUCT]: "admin.subscriptions.product.granted",
}

export function productKey(product: string | null): DictionaryKey | null {
  return product === null ? null : (PRODUCT_KEYS[product] ?? null)
}

/** The statuses under which an organisation still holds its right of use, as `/me` counts them. */
const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"]

export function subscriptionIsLive(status: string): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.includes(status)
}

export function canCancelSubscription(status: string): boolean {
  return status !== "canceled"
}

export interface SubscriptionRow {
  product: string
  status: string
}

/** A platform row is the team's to remove; a Stripe row only once Stripe has let go of it. */
export function canDeleteSubscription({
  product,
  status,
}: SubscriptionRow): boolean {
  return isPlatformProduct(product) || !subscriptionIsLive(status)
}

export function canResizeSubscription(product: string): boolean {
  return product === GRANTED_PRODUCT
}

/** Stripe holds the trial: only a row it still bills as `trialing` takes a new end. */
export function canExtendTrial({ product, status }: SubscriptionRow): boolean {
  return !isPlatformProduct(product) && status === "trialing"
}

export interface ResumableSubscription extends SubscriptionRow {
  cancel_at_period_end: boolean
}

export function canResumeSubscription({
  product,
  status,
  cancel_at_period_end,
}: ResumableSubscription): boolean {
  return (
    !isPlatformProduct(product) &&
    subscriptionIsLive(status) &&
    cancel_at_period_end
  )
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

/** A day picked in the console ends where the team sits: the right of use covers the whole of it. */
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

/** What an account in this state has left to be done to it: the page shows these and nothing else. */
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

export interface AccountStanding {
  state: string
  banned_reason?: string | null
  deactivated_reason: string | null
  deletion_reason: string | null
}

/** The reason that belongs to the state the account holds, and no older one. */
export function accountReason(account: AccountStanding): string | null {
  if (account.state === "deleting") {
    return account.deletion_reason
  }

  if (account.state === "deactivated") {
    return account.deactivated_reason
  }

  return account.state === "suspended" ? (account.banned_reason ?? null) : null
}

export interface OrganizationStanding {
  state: string
  suspended_reason: string | null
  closed_reason: string | null
  deletion_reason: string | null
}

export function organizationReason(
  organization: OrganizationStanding
): string | null {
  if (organization.state === "deleting") {
    return organization.deletion_reason
  }

  if (organization.state === "closed") {
    return organization.closed_reason
  }

  return organization.state === "suspended"
    ? organization.suspended_reason
    : null
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
