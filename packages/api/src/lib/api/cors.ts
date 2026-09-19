import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { appUrlFromEnv } from "../billing/config"

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

function isLocal(origin: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname)
  } catch {
    return false
  }
}

/**
 * The origins a route open to the browser answers: the site, and the machine
 * of whoever runs the platform locally — the console's own address says which
 * of the two the platform is serving.
 */
export function siteOrigin(origin: string | null): string | null {
  if (origin === null) {
    return null
  }

  if (origin === PUPITRE_ORIGINS.site) {
    return origin
  }

  return isLocal(appUrlFromEnv()) && isLocal(origin) ? origin : null
}
