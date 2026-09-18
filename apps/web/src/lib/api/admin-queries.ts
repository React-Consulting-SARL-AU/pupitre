import { unwrap } from "@pupitre/api/client"
import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import {
  type AdminEventPageQuery,
  type AdminPageQuery,
  type AdminServerPageQuery,
  type AdminSubscriptionPageQuery,
  queryKeys,
} from "@/lib/api/queries"
import type { ReleaseBuild } from "@/lib/domain/admin"

const APP_RELEASES_PER_CHANNEL = 50

async function readOverview() {
  return unwrap(await api().api.v1.admin.overview.get()).data
}

export type AdminOverviewData = Awaited<ReturnType<typeof readOverview>>

export function adminOverviewQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.overview,
    queryFn: readOverview,
  })
}

async function readUsers(page: AdminPageQuery) {
  return unwrap(await api().api.v1.admin.users.get({ query: page }))
}

export type AdminUser = Awaited<ReturnType<typeof readUsers>>["data"][number]

export function adminUsersQueryOptions(page: AdminPageQuery) {
  return queryOptions({
    queryKey: queryKeys.admin.users(page),
    queryFn: () => readUsers(page),
    placeholderData: keepPreviousData,
  })
}

async function readUser(id: string) {
  return unwrap(await api().api.v1.admin.users({ id }).get()).data
}

export type AdminUserDetail = Awaited<ReturnType<typeof readUser>>

export function adminUserQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.admin.user(id),
    queryFn: () => readUser(id),
  })
}

export function banUser(id: string, reason: string): Promise<void> {
  return api()
    .api.v1.admin.users({ id })
    .ban.post({ reason })
    .then((response) => {
      unwrap(response)
    })
}

export function unbanUser(id: string): Promise<void> {
  return api()
    .api.v1.admin.users({ id })
    .unban.post()
    .then((response) => {
      unwrap(response)
    })
}

async function readOrganizations(page: AdminPageQuery) {
  return unwrap(await api().api.v1.admin.organizations.get({ query: page }))
}

export type AdminOrganization = Awaited<
  ReturnType<typeof readOrganizations>
>["data"][number]

export function adminOrganizationsQueryOptions(page: AdminPageQuery) {
  return queryOptions({
    queryKey: queryKeys.admin.organizations(page),
    queryFn: () => readOrganizations(page),
    placeholderData: keepPreviousData,
  })
}

async function readOrganization(id: string) {
  return unwrap(await api().api.v1.admin.organizations({ id }).get()).data
}

export type AdminOrganizationDetail = Awaited<
  ReturnType<typeof readOrganization>
>

export function adminOrganizationQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.admin.organization(id),
    queryFn: () => readOrganization(id),
  })
}

async function readSubscriptions(page: AdminSubscriptionPageQuery) {
  return unwrap(await api().api.v1.admin.subscriptions.get({ query: page }))
}

export type AdminSubscription = Awaited<
  ReturnType<typeof readSubscriptions>
>["data"][number]

export function adminSubscriptionsQueryOptions(
  page: AdminSubscriptionPageQuery
) {
  return queryOptions({
    queryKey: queryKeys.admin.subscriptions(page),
    queryFn: () => readSubscriptions(page),
    placeholderData: keepPreviousData,
  })
}

async function readEvents(page: AdminEventPageQuery) {
  return unwrap(await api().api.v1.admin.events.get({ query: page }))
}

export type AdminEvent = Awaited<ReturnType<typeof readEvents>>["data"][number]

export function adminEventsQueryOptions(page: AdminEventPageQuery) {
  return queryOptions({
    queryKey: queryKeys.admin.events(page),
    queryFn: () => readEvents(page),
    placeholderData: keepPreviousData,
  })
}

async function readTeam() {
  return unwrap(await api().api.v1.admin.team.get()).data
}

export type AdminTeamMember = Awaited<ReturnType<typeof readTeam>>[number]

export function adminTeamQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.team,
    queryFn: readTeam,
  })
}

async function readReleases() {
  return unwrap(await api().api.v1.admin.releases.get()).data
}

export type AdminRelease = Awaited<ReturnType<typeof readReleases>>[number]

export function adminReleasesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.releases,
    queryFn: readReleases,
  })
}

async function readAppReleasesOn(channel: "stable" | "beta") {
  return unwrap(
    await api().api.v1.releases.app.get({
      query: { channel, limit: APP_RELEASES_PER_CHANNEL },
    })
  ).data
}

/**
 * The app has no admin listing: its versions come from the public one, which
 * answers a channel at a time, and a version lives in exactly one channel.
 */
async function readAppReleases(): Promise<ReleaseBuild[]> {
  const channels = await Promise.all([
    readAppReleasesOn("stable"),
    readAppReleasesOn("beta"),
  ])

  return channels.flat().flatMap((release) =>
    release.builds.map(() => ({
      version: release.version,
      channel: release.channel,
      published_at: release.published_at,
    }))
  )
}

export function adminAppReleasesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.appReleases,
    queryFn: readAppReleases,
  })
}

export function promoteRelease(version: string): Promise<void> {
  return api()
    .api.v1.admin.releases({ version })
    .promote.post({ channel: "stable" })
    .then((response) => {
      unwrap(response)
    })
}

export function promoteAppRelease(version: string): Promise<void> {
  return api()
    .api.v1.admin["app-releases"]({ version })
    .promote.post({ channel: "stable" })
    .then((response) => {
      unwrap(response)
    })
}

async function readServers(page: AdminServerPageQuery) {
  return unwrap(await api().api.v1.admin.servers.get({ query: page }))
}

export type AdminServer = Awaited<
  ReturnType<typeof readServers>
>["data"][number]

export type AdminServerPage = Awaited<ReturnType<typeof readServers>>

export function adminServersQueryOptions(page: AdminServerPageQuery) {
  return queryOptions({
    queryKey: queryKeys.admin.servers(page),
    queryFn: () => readServers(page),
    placeholderData: keepPreviousData,
  })
}

async function readServer(id: string) {
  return unwrap(await api().api.v1.admin.servers({ id }).get()).data
}

export type AdminServerDetail = Awaited<ReturnType<typeof readServer>>

export function adminServerQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.admin.server(id),
    queryFn: () => readServer(id),
  })
}

export function suspendServer(
  id: string,
  reason: string
): Promise<AdminServer> {
  return api()
    .api.v1.admin.servers({ id })
    .suspend.post({ reason })
    .then((response) => unwrap(response).data)
}

/** Only the team lifts the suspension the team laid; a returning subscription never does. */
export function restoreServer(id: string): Promise<AdminServer> {
  return api()
    .api.v1.admin.servers({ id })
    .restore.post()
    .then((response) => unwrap(response).data)
}

async function readAffiliateLinks() {
  return unwrap(await api().api.v1.admin["affiliate-links"].get()).data
}

export type AffiliateLink = Awaited<
  ReturnType<typeof readAffiliateLinks>
>[number]

export function affiliateLinksQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.affiliateLinks,
    queryFn: readAffiliateLinks,
  })
}

async function readAffiliateLink(id: string) {
  return unwrap(await api().api.v1.admin["affiliate-links"]({ id }).get()).data
}

export type AffiliateLinkDetail = Awaited<ReturnType<typeof readAffiliateLink>>

export function affiliateLinkQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.admin.affiliateLink(id),
    queryFn: () => readAffiliateLink(id),
  })
}

export interface AffiliateLinkInput {
  name: string
  code?: string
  free_months: number
  seats?: number
}

/** The list is what shows the link once it exists: the answer only has to be a success. */
export function createAffiliateLink(input: AffiliateLinkInput): Promise<void> {
  return api()
    .api.v1.admin["affiliate-links"].post(input)
    .then((response) => {
      unwrap(response)
    })
}

export function setAffiliateLinkDisabled(
  id: string,
  disabled: boolean
): Promise<AffiliateLink> {
  return api()
    .api.v1.admin["affiliate-links"]({ id })
    .patch({ disabled })
    .then((response) => unwrap(response).data)
}
