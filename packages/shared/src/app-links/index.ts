/**
 * The links that open the desktop app, as the platform writes them and the
 * app reads them. The app registers the scheme; the console sends the reader
 * back to it once a device is confirmed.
 */

export const APP_LINK_SCHEME = "pupitre"

export function accountCallbackLink(
  query: Record<string, string> = {}
): string {
  const search = new URLSearchParams(query).toString()

  return `${APP_LINK_SCHEME}://account/callback${search ? `?${search}` : ""}`
}
