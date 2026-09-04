import { ApiError, unwrap } from "@pupitre/api/client"
import type { OrgRole } from "@pupitre/shared/permissions"
import { queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import type { BillingIntervalName } from "@/lib/domain/billing"

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
  status: ["status"] as const,
}

export function statusQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.status,
    queryFn: async () => unwrap(await api().api.v1.status.get()).data,
    refetchInterval: STATUS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

export function meQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.me,
    queryFn: async () => unwrap(await api().api.v1.me.get()),
  })
}

export function serversQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.servers,
    queryFn: async () => unwrap(await api().api.v1.servers.get()).data,
    refetchInterval: SERVERS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

export function serverQueryOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.server(id),
    queryFn: async () => unwrap(await api().api.v1.servers({ id }).get()).data,
    refetchInterval: SERVERS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}

export function devicesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.devices,
    queryFn: async () => unwrap(await api().api.v1.me.devices.get()).data,
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

export function subscriptionQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: queryKeys.subscription(organizationId),
    queryFn: async () =>
      unwrap(await api().api.v1.orgs({ id: organizationId }).subscription.get())
        .data,
  })
}

export interface CheckoutInput {
  quantity: number
  interval: BillingIntervalName
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

export function membersQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: queryKeys.members(organizationId),
    queryFn: async () =>
      unwrap(await api().api.v1.orgs({ id: organizationId }).members.get())
        .data,
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
