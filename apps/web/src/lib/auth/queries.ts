import { queryOptions } from "@tanstack/react-query"
import { authClient } from "@/lib/auth/client"

export interface PasskeySummary {
  id: string
  name?: string | null
  createdAt?: string | Date | null
}

export const authQueryKeys = {
  passkeys: ["auth", "passkeys"] as const,
  session: ["auth", "session"] as const,
}

export function passkeysQueryOptions() {
  return queryOptions({
    queryKey: authQueryKeys.passkeys,
    queryFn: async (): Promise<PasskeySummary[]> => {
      const { data, error } = await authClient().passkey.listUserPasskeys()

      if (error) {
        throw new Error(
          error.message ?? "Vos clés d'accès n'ont pas pu être lues."
        )
      }

      return data ?? []
    },
  })
}

/**
 * The second factor lives in the Better Auth session, not in `/api/v1/me`:
 * the platform contract does not carry it, and the console has no reason to
 * widen the contract for a flag the auth client already hands over.
 */
export function twoFactorEnabledQueryOptions() {
  return queryOptions({
    queryKey: authQueryKeys.session,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await authClient().getSession()

      if (error) {
        throw new Error(error.message ?? "Votre session n'a pas pu être relue.")
      }

      const user = data?.user as { twoFactorEnabled?: boolean } | undefined

      return user?.twoFactorEnabled === true
    },
  })
}
