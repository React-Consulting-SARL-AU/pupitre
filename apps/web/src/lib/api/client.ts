import { type ApiClient, createApiClient } from "@pupitre/api/client"
import { appOrigin } from "@/lib/config/urls"

let client: ApiClient | null = null

export function api(): ApiClient {
  client ??= createApiClient(appOrigin())

  return client
}

export function setApiClient(next: ApiClient | null): void {
  client = next
}
