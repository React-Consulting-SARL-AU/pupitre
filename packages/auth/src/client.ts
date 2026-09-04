import { createAuthClient as createBetterAuthClient } from "better-auth/client"

export interface CreateAuthClientOptions {
  baseURL?: string
}

export function createAuthClient(options: CreateAuthClientOptions = {}) {
  return createBetterAuthClient({ baseURL: options.baseURL })
}

export type AuthClient = ReturnType<typeof createAuthClient>
