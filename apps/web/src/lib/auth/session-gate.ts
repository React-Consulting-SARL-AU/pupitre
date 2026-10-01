import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { isUnauthenticated } from "@/lib/api/errors"
import { type Me, meQueryOptions } from "@/lib/api/queries"
import { CONSENT_ROUTE } from "@/lib/domain/consent-gate"

export interface SessionGateInput {
  context: { queryClient: QueryClient }
  location: { href: string }
}

function signInAndComeBack(href: string) {
  return redirect({ to: "/auth/sign-in", search: { callbackURL: href } })
}

export function consentAndComeBack(href: string) {
  return redirect({ to: CONSENT_ROUTE, search: { callbackURL: href } })
}

async function sessionOrSignIn({
  context,
  location,
}: SessionGateInput): Promise<Me> {
  const me = await context.queryClient
    .ensureQueryData(meQueryOptions())
    .catch(() => null)

  if (!me) {
    throw signInAndComeBack(location.href)
  }

  return me
}

// The device and invitation pages are opened from a link, often in a browser that holds no session yet.
export async function requireSession(input: SessionGateInput): Promise<void> {
  await sessionOrSignIn(input)
}

export async function requireSessionAndConsent(
  input: SessionGateInput
): Promise<void> {
  const me = await sessionOrSignIn(input)

  if (me.data_consent === null) {
    throw consentAndComeBack(input.location.href)
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
