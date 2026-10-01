export const BEACON_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com"

export const BEACON_SCRIPT_URL = `${BEACON_SCRIPT_ORIGIN}/beacon.min.js`

export const BEACON_REPORT_ORIGIN = "https://cloudflareinsights.com"

export function beaconConfig(token: string): string {
  return JSON.stringify({ token })
}

export function analyticsToken(
  value: string | undefined = import.meta.env.PUBLIC_CF_WEB_ANALYTICS_TOKEN
): string | null {
  const token = value?.trim()

  return token ? token : null
}
