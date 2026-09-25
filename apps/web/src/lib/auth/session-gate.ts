import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { isUnauthenticated } from "@/lib/api/errors"
import { type Me, meQueryOptions } from "@/lib/api/queries"

export interface SessionGateInput {
  context: { queryClient: QueryClient }
  location: { href: string }
}

function signInAndComeBack(href: string) {
  return redirect({ to: "/auth/sign-in", search: { callbackURL: href } })
}

// The device and invitation pages are opened from a link, often in a browser that holds no session yet.
export async function requireSession({
  context,
  location,
}: SessionGateInput): Promise<void> {
  const me = await context.queryClient
    .ensureQueryData(meQueryOptions())
    .catch(() => null)

  if (!me) {
    throw signInAndComeBack(location.href)
  }
}

export async function readSessionOrSignIn({
  context,
  location,
}: SessionGateInput): Promise<Me | null> {
  try {
    return await context.queryClient.ensureQueryData(meQueryOptions())
  } catch (error) {
    if (isUnauthenticated(error)) {
      throw signInAndComeBack(location.href)
    }

    return null
  }
}
