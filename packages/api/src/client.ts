import { treaty } from "@elysiajs/eden"
import type { Api } from "./server"

export type { Api } from "./server"

export interface ApiClientOptions {
  fetch?: RequestInit
  fetcher?: typeof fetch
}

export function createApiClient(
  baseUrl: string,
  options: ApiClientOptions = {}
) {
  return treaty<Api>(baseUrl, {
    fetch: { cache: "no-store", ...options.fetch },
    fetcher: options.fetcher,
  })
}

export type ApiClient = ReturnType<typeof createApiClient>
