export const LICENSE_ROUTE = "/dashboard/billing"

export const ADMIN_ROUTE = "/dashboard/admin"

const SERVERS_ROUTE = "/dashboard/servers"

const OPEN_WITHOUT_LICENSE = new Set([
  LICENSE_ROUTE,
  "/dashboard/settings",
  "/dashboard/organization",
  "/dashboard/download",
])

const TRAILING_SLASH_RE = /(.)\/+$/

export interface LicenseGateInput {
  license: string
  pathname: string
}

function normalize(pathname: string): string {
  return pathname.replace(TRAILING_SLASH_RE, "$1")
}

function isWithin(pathname: string, route: string): boolean {
  const target = normalize(pathname)

  return target === route || target.startsWith(`${route}/`)
}

// Platform pages belong to no organisation: a missing licence never closes them.
export function isAdminRoute(pathname: string): boolean {
  return isWithin(pathname, ADMIN_ROUTE)
}

// The servers stay reachable: removing one is a way back under the free quota.
export function opensWithoutLicense(pathname: string): boolean {
  return (
    OPEN_WITHOUT_LICENSE.has(normalize(pathname)) ||
    isWithin(pathname, SERVERS_ROUTE) ||
    isAdminRoute(pathname)
  )
}

export function sendsToLicense({
  license,
  pathname,
}: LicenseGateInput): boolean {
  return license === "suspended" && !opensWithoutLicense(pathname)
}
