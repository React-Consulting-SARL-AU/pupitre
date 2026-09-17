import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { meQueryOptions } from "@/lib/api/queries"

export interface SessionGateInput {
  context: { queryClient: QueryClient }
  location: { href: string }
}

/**
 * A page that needs a person behind it sends them to sign in and comes back
 * here afterwards: the device and invitation pages are opened from a link,
 * often in a browser that holds no session yet.
 */
export async function requireSession({
  context,
  location,
}: SessionGateInput): Promise<void> {
  const me = await context.queryClient
    .ensureQueryData(meQueryOptions())
    .catch(() => null)

  if (!me) {
    throw redirect({
      to: "/auth/sign-in",
      search: { callbackURL: location.href },
    })
  }
}
