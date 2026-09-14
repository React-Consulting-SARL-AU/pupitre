export const DEFAULT_CALLBACK_URL = "/dashboard/servers"

/**
 * The destination a sign-in is heading to travels through the URL, so
 * anything pointing off this origin is dropped: an open redirect behind a
 * sign-in is a phishing tool.
 */
export function safeCallbackUrl(value: unknown, origin: string): string {
  if (typeof value !== "string" || value === "") {
    return DEFAULT_CALLBACK_URL
  }

  try {
    const target = new URL(value, origin)

    return target.origin === origin
      ? `${target.pathname}${target.search}`
      : DEFAULT_CALLBACK_URL
  } catch {
    return DEFAULT_CALLBACK_URL
  }
}
