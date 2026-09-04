import {
  adminClient,
  deviceAuthorizationClient,
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { ac, platformAc, platformRoles, roles } from "../access-control"

export interface WebAuthClientOptions {
  baseURL?: string
}

export function createWebAuthClient(options: WebAuthClientOptions = {}) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [
      organizationClient({ ac, roles }),
      adminClient({ ac: platformAc, roles: platformRoles }),
      magicLinkClient(),
      deviceAuthorizationClient(),
    ],
  })
}

export type WebAuthClient = ReturnType<typeof createWebAuthClient>
