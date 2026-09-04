import { passkeyClient } from "@better-auth/passkey/client"
import {
  adminClient,
  deviceAuthorizationClient,
  magicLinkClient,
  organizationClient,
  twoFactorClient,
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
      passkeyClient(),
      twoFactorClient(),
    ],
  })
}

export type WebAuthClient = ReturnType<typeof createWebAuthClient>
