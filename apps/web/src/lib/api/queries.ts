import { ApiError, unwrap } from "@pupitre/api/client"
import type { Locale } from "@pupitre/shared/i18n"
import type { OrgRole } from "@pupitre/shared/permissions"
import { isLiveSubscriptionStatus } from "@pupitre/shared/plans"
import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"

// Heartbeats land every five minutes; fifteen seconds keeps the page live without hammering the database.
export const SERVERS_POLL_INTERVAL_MS = 15_000

export const STATUS_POLL_INTERVAL_MS = 30_000

const NOT_FOUND = 404

export const queryKeys = {
  me: ["me"] as const,
  servers: ["servers"] as const,
  server: (id: string) => ["servers", id] as const,
  serverBackups: (id: string) => ["servers", id, "backups"] as const,
  backups: ["backups"] as const,
  devices: ["devices"] as const,
  subscription: (organizationId: string) =>
    ["subscription", organizationId] as const,
  members: (organizationId: string) => ["members", organizationId] as const,
  events: (organizationId: string, page: EventPageQuery) =>
    ["events", organizationId, page] as const,
  latestRelease: ["releases", "latest"] as const,
  latestAppRelease: ["releases", "app", "latest"] as const,
  status: ["status"] as const,
  socialProviders: ["status", "social-providers"] as const,
  admin: {
    overview: ["admin", "overview"] as const,
    users: (page: AdminPageQuery) => ["admin", "users", page] as const,
    user: (id: string) => ["admin", "user", id] as const,
    allUsers: ["admin", "users"] as const,
    servers: (page: AdminServerPageQuery) =>
      ["admin", "servers", page] as const,
    server: (id: string) => ["admin", "server", id] as const,
    allServers: ["admin", "servers"] as const,
    organizations: (page: AdminPageQuery) =>
      ["admin", "organizations", page] as const,
    organization: (id: string) => ["admin", "organization", id] as const,
    allOrganizations: ["admin", "organizations"] as const,
    subscriptions: (page: AdminSubscriptionPageQuery) =>
      ["admin", "subscriptions", page] as const,
    subscription: (id: string) => ["admin", "subscription", id] as const,
    allSubscriptions: ["admin", "subscriptions"] as const,
    events: (page: AdminEventPageQuery) => ["admin", "events", page] as const,
    affiliateLinks: ["admin", "affiliate-links"] as const,
    affiliateLink: (id: string) => ["admin", "affiliate-link", id] as const,
    releases: ["admin", "releases"] as const,
    appReleases: ["admin", "app-releases"] as const,
    team: ["admin", "team"] as const,
    search: (query: string) => ["admin", "search", query] as const,
  },
}

export interface AdminPageQuery {
  limit: number
  offset: number
  q?: string
  state?: string
}

export type AdminSortDirection = "asc" | "desc"

export interface AdminServerPageQuery extends AdminPageQuery {
  status?: string
  organization_id?: string
  stale?: boolean
  sort?: "created_at" | "last_heartbeat_at" | "name"
  direction?: AdminSortDirection
}

export interface AdminSubscriptionPageQuery {
  limit: number
  offset: number
  status?: string
  product?: string
  organization_id?: string
  live?: boolean
  drifted?: boolean
  q?: string
  sort?: "created_at" | "current_period_end" | "updated_at"
  direction?: AdminSortDirection
}

export interface AdminEventPageQuery {
  limit: number
  offset: number
  organization_id?: string
  actor_user_id?: string
  action?: string
  target_type?: string
}

export const ORGANIZATION_SCOPED_ROOTS = [
  "servers",
  "backups",
  "subscription",
  "members",
  "events",
]

export function isOrganizationScoped(queryKey: readonly unknown[]): boolean {
  return ORGANIZATION_SCOPED_ROOTS.includes(queryKey[0] as string)
}

export function statusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.status,
    queryFn: async () => unwrap(await api().api.v1.status.get()).data,
    refetchInterval: STATUS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

export function socialProvidersQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.socialProviders,
    queryFn: async () =>
      unwrap(await api().api.v1.status.get()).data.social_providers,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

async function readMe() {
  return unwrap(await api().api.v1.me.get())
}

export type Me = Awaited<ReturnType<typeof readMe>>

export function meQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.me,
    queryFn: readMe,
  })
}

export function updateLocale(locale: Locale): Promise<void> {
  return api()
    .api.v1.me.patch({ locale })
    .then((response) => {
      unwrap(response)
    })
}

async function readServers() {
  return unwrap(await api().api.v1.servers.get()).data
}

export type ServerSummary = Awaited<ReturnType<typeof readServers>>[number]

export function serversQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.servers,
    queryFn: readServers,
    refetchInterval: SERVERS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

async function readServer(id: string) {
  return unwrap(await api().api.v1.servers({ id }).get()).data
}

export type ServerDetail = Awaited<ReturnType<typeof readServer>>

export function serverQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.server(id),
    queryFn: () => readServer(id),
    refetchInterval: SERVERS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

async function readBackups() {
  return unwrap(await api().api.v1.backups.get()).data
}

export type Backup = Awaited<ReturnType<typeof readBackups>>[number]

export function backupsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.backups,
    queryFn: readBackups,
  })
}

export function serverBackupsQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.serverBackups(id),
    queryFn: async () =>
      unwrap(await api().api.v1.servers({ id }).backups.get()).data,
  })
}

export function forgetBackup(id: string): Promise<void> {
  return api()
    .api.v1.backups({ id })
    .forget.post()
    .then((response) => {
      unwrap(response)
    })
}

async function readDevices() {
  return unwrap(await api().api.v1.me.devices.get()).data
}

export type Device = Awaited<ReturnType<typeof readDevices>>[number]

export function devicesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.devices,
    queryFn: readDevices,
  })
}

export function deleteDevice(id: string): Promise<void> {
  return api()
    .api.v1.me.devices({ id })
    .delete()
    .then((response) => {
      unwrap(response)
    })
}

export function deleteServer(id: string): Promise<void> {
  return api()
    .api.v1.servers({ id })
    .delete()
    .then((response) => {
      unwrap(response)
    })
}

async function readSubscription(organizationId: string) {
  return unwrap(
    await api().api.v1.orgs({ id: organizationId }).subscription.get()
  ).data
}

export function subscriptionQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: queryKeys.subscription(organizationId),
    queryFn: () => readSubscription(organizationId),
  })
}

export type Subscription = NonNullable<
  Awaited<ReturnType<typeof readSubscription>>
>

export function isLiveSubscription(subscription: Subscription): boolean {
  return isLiveSubscriptionStatus(subscription.status)
}

export function openBillingPortal(organizationId: string): Promise<string> {
  return api()
    .api.v1.orgs({ id: organizationId })
    .portal.post()
    .then((response) => unwrap(response).url)
}

export function latestReleaseQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.latestRelease,
    queryFn: async () => {
      try {
        return unwrap(
          await api().api.v1.releases.agent.latest.get({
            query: { channel: "stable" },
          })
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === NOT_FOUND) {
          return null
        }

        throw error
      }
    },
    retry: false,
  })
}

async function latestAppRelease(channel: "stable" | "beta") {
  try {
    return unwrap(
      await api().api.v1.releases.app.latest.get({ query: { channel } })
    ).data
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND) {
      return null
    }

    throw error
  }
}

// Falls back on the beta until a first stable version exists.
export function latestAppReleaseQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.latestAppRelease,
    queryFn: async () =>
      (await latestAppRelease("stable")) ?? (await latestAppRelease("beta")),
    retry: false,
  })
}

async function readMembers(organizationId: string) {
  return unwrap(await api().api.v1.orgs({ id: organizationId }).members.get())
    .data
}

export type Roster = Awaited<ReturnType<typeof readMembers>>

export function membersQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: queryKeys.members(organizationId),
    queryFn: () => readMembers(organizationId),
  })
}

export interface InvitationInput {
  email: string
  role: OrgRole
}

export function inviteMember(
  organizationId: string,
  input: InvitationInput
): Promise<void> {
  return api()
    .api.v1.orgs({ id: organizationId })
    .invitations.post(input)
    .then((response) => {
      unwrap(response)
    })
}

export interface EventPageQuery {
  limit: number
  offset: number
  action?: string
}

export function eventsQueryOptions(
  organizationId: string,
  page: EventPageQuery
) {
  return queryOptions({
    queryKey: queryKeys.events(organizationId, page),
    queryFn: async () =>
      unwrap(
        await api()
          .api.v1.orgs({ id: organizationId })
          .events.get({ query: page })
      ),
    placeholderData: keepPreviousData,
  })
}

export type AssignServerInput = { user_id: string } | { invite_email: string }

export function assignServer(
  serverId: string,
  input: AssignServerInput
): Promise<void> {
  return api()
    .api.v1.servers({ id: serverId })
    .assign.post(input)
    .then((response) => {
      unwrap(response)
    })
}

export function unassignServer(serverId: string): Promise<void> {
  return api()
    .api.v1.servers({ id: serverId })
    .unassign.post()
    .then((response) => {
      unwrap(response)
    })
}

export function revokeServerDevice(
  serverId: string,
  deviceId: string
): Promise<void> {
  return api()
    .api.v1.servers({ id: serverId })
    ["revoke-device"].post({ device_id: deviceId })
    .then((response) => {
      unwrap(response)
    })
}
