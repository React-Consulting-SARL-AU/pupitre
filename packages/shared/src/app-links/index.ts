export const APP_LINK_SCHEME = "pupitre"

export function accountCallbackLink(
  query: Record<string, string> = {}
): string {
  const search = new URLSearchParams(query).toString()

  return `${APP_LINK_SCHEME}://account/callback${search ? `?${search}` : ""}`
}
