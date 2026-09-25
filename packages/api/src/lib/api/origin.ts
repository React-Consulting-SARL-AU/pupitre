import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"])

// The site is trusted for its affiliate beacon, which carries the console's cookie as a same-site request.
const TRUSTED_ORIGINS: ReadonlySet<string> = new Set([
  PUPITRE_ORIGINS.app,
  PUPITRE_ORIGINS.site,
  PUPITRE_ORIGINS.devTunnel,
])

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
])

function isLoopback(url: string): boolean {
  return URL.canParse(url) && LOOPBACK_HOSTS.has(new URL(url).hostname)
}

/** A request a browser sent from a page that is neither this origin nor one of Pupitre's own. */
export function isForeignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")

  if (origin === null) {
    return false
  }

  const local = isLoopback(origin) && isLoopback(request.url)

  return (
    origin !== new URL(request.url).origin &&
    !TRUSTED_ORIGINS.has(origin) &&
    !local
  )
}

// SameSite=Lax still sends the session cookie from any pupitre.studio subdomain: only the Origin tells them apart.
export function isForeignCookieWrite(request: Request): boolean {
  if (
    READ_METHODS.has(request.method) ||
    request.headers.has("authorization") ||
    !request.headers.has("cookie")
  ) {
    return false
  }

  return isForeignOrigin(request)
}
