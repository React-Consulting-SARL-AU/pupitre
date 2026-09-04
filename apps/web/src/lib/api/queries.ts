import { ApiError, unwrap } from "@pupitre/api/client"
import { queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import type { BillingIntervalName } from "@/lib/domain/billing"

export const SERVERS_POLL_INTERVAL_MS = 5000

const NOT_FOUND = 404

export const queryKeys = {
  me: ["me"] as const,
  servers: ["servers"] as const,
  server: (id: string) => ["servers", id] as const,
  devices: ["devices"] as const,
  subscription: (organizationId: string) =>
    ["subscription", organizationId] as const,
  latestRelease: ["releases", "latest"] as const,
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
