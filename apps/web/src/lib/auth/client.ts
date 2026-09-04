import {
  createWebAuthClient,
  type WebAuthClient,
} from "@pupitre/auth/client/web"
import { appOrigin } from "@/lib/config/urls"

let client: WebAuthClient | null = null

export function authClient(): WebAuthClient {
  client ??= createWebAuthClient({ baseURL: appOrigin() })

  return client
}
