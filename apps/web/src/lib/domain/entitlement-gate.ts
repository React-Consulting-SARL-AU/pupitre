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

export const ADMIN_ROUTE = "/dashboard/admin"

// Platform pages belong to no organisation: a lapsed subscription never closes them.
export function isAdminRoute(pathname: string): boolean {
  const target = normalize(pathname)

  return target === ADMIN_ROUTE || target.startsWith(`${ADMIN_ROUTE}/`)
}

export function opensWhileSuspended(pathname: string): boolean {
  return OPEN_WHILE_SUSPENDED.has(normalize(pathname)) || isAdminRoute(pathname)
}

// Without a subscription (a running trial counts as one), Stripe's return lands on the start page.
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
