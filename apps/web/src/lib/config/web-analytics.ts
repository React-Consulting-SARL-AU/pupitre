export const WEB_ANALYTICS_SCRIPT_ORIGIN =
  "https://static.cloudflareinsights.com"

export const WEB_ANALYTICS_SCRIPT_URL = `${WEB_ANALYTICS_SCRIPT_ORIGIN}/beacon.min.js`

export const WEB_ANALYTICS_REPORT_ORIGIN = "https://cloudflareinsights.com"

export function webAnalyticsToken(
  env: Pick<CloudflareEnv, "CF_WEB_ANALYTICS_TOKEN">
): string | null {
  return env.CF_WEB_ANALYTICS_TOKEN?.trim() || null
}

export function webAnalyticsBeaconConfig(token: string): string {
  return JSON.stringify({ token })
}
