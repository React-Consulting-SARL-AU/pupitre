import { unwrap } from "@pupitre/api/client"
import { queryOptions } from "@tanstack/react-query"
import { api } from "@/lib/api/client"

export const SERVERS_POLL_INTERVAL_MS = 5000

export const queryKeys = {
  me: ["me"] as const,
  servers: ["servers"] as const,
  server: (id: string) => ["servers", id] as const,
  devices: ["devices"] as const,
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
