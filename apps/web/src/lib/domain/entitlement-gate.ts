export const START_ROUTE = "/dashboard/start"

const OPEN_WHILE_SUSPENDED = new Set([
  START_ROUTE,
  "/dashboard/billing",
  "/dashboard/settings",
  "/dashboard/organization",
  "/dashboard/download",
])

const TRAILING_SLASH_RE = /(.)\/+$/

export interface EntitlementGateInput {
  entitlement: string
  pathname: string
  checkout?: string
}

export interface StartRedirect {
  checkout?: "done"
}

function normalize(pathname: string): string {
  return pathname.replace(TRAILING_SLASH_RE, "$1")
}

/** The pages a console without a subscription can still open, and show. */
export function opensWhileSuspended(pathname: string): boolean {
  return OPEN_WHILE_SUSPENDED.has(normalize(pathname))
}

/**
 * Without a subscription — an ongoing trial is one — the console has a single
 * step to offer, and Stripe's return lands on it rather than on the billing page.
 */
export function startRedirectFor({
  entitlement,
  pathname,
  checkout,
}: EntitlementGateInput): StartRedirect | null {
  const target = normalize(pathname)

  if (entitlement !== "suspended" || target === START_ROUTE) {
    return null
  }

  if (checkout === "done") {
    return { checkout: "done" }
  }

  return opensWhileSuspended(target) ? null : {}
}
