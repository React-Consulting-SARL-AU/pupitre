import { ApiError, unwrap } from "@pupitre/api/client"
import type { Locale } from "@pupitre/shared/i18n"
import type { OrgRole } from "@pupitre/shared/permissions"
import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import type { BillingIntervalName, CheckoutReturn } from "@/lib/domain/billing"

export const SERVERS_POLL_INTERVAL_MS = 5000

export const STATUS_POLL_INTERVAL_MS = 30_000

const NOT_FOUND = 404

export const queryKeys = {
  me: ["me"] as const,
  servers: ["servers"] as const,
  server: (id: string) => ["servers", id] as const,
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
}

/** The query roots whose answers belong to one organisation and to no other. */
export const ORGANIZATION_SCOPED_ROOTS = [
  "servers",
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

export const SUBSCRIPTION_POLL_INTERVAL_MS = 1000

export const SUBSCRIPTION_POLL_TIMEOUT_MS = 60_000

export interface SubscriptionPoll {
  intervalMs?: number
  timeoutMs?: number
}

export type Subscription = NonNullable<
  Awaited<ReturnType<typeof readSubscription>>
>

/**
 * Stripe alone opens a subscription, and tells us by webhook: coming back from
 * Checkout, the console has nothing to create and everything to wait for.
 */
export async function pollSubscription(
  organizationId: string,
  {
    intervalMs = SUBSCRIPTION_POLL_INTERVAL_MS,
    timeoutMs = SUBSCRIPTION_POLL_TIMEOUT_MS,
  }: SubscriptionPoll = {}
): Promise<Subscription> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const subscription = await readSubscription(organizationId)

    if (subscription) {
      return subscription
    }

    if (Date.now() >= deadline) {
      throw new Error("the webhook has not landed yet")
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export interface CheckoutInput {
  quantity: number
  interval: BillingIntervalName
  return_to?: CheckoutReturn
}

export function startCheckout(
  organizationId: string,
  input: CheckoutInput
): Promise<string> {
  return api()
    .api.v1.orgs({ id: organizationId })
    .checkout.post(input)
    .then((response) => unwrap(response).url)
}

export function updateSeats(
  organizationId: string,
  quantity: number
): Promise<Subscription | null> {
  return api()
    .api.v1.orgs({ id: organizationId })
    .seats.post({ quantity })
    .then((response) => unwrap(response).data)
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

export function latestAppReleaseQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.latestAppRelease,
    queryFn: async () => {
      try {
        return unwrap(
          await api().api.v1.releases.app.latest.get({
            query: { channel: "stable" },
          })
        ).data
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
