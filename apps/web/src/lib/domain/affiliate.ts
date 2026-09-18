import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AFFILIATE_CODE_RE,
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_DAYS,
} from "@pupitre/shared/plans"

const SECONDS_PER_DAY = 86_400

const AFFILIATE_DOMAIN = new URL(PUPITRE_ORIGINS.site).hostname

/** The address a link is distributed as, composed the way the platform composes it. */
export function affiliateUrlFor(code: string): string {
  return `${PUPITRE_ORIGINS.site}/?ref=${encodeURIComponent(code)}`
}

export function isAffiliateCode(value: unknown): value is string {
  return typeof value === "string" && AFFILIATE_CODE_RE.test(value)
}

/** The code the marketing site, or the sign-in page, left in the browser; nothing when it is unreadable. */
export function affiliateCodeFrom(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=")

    if (
      separator === -1 ||
      part.slice(0, separator).trim() !== AFFILIATE_COOKIE
    ) {
      continue
    }

    const value = part.slice(separator + 1).trim()

    return isAffiliateCode(value) ? value : null
  }

  return null
}

/** The domain the console and the site share the cookie under, or nothing when the host is neither. */
export function affiliateCookieDomain(hostname: string): string | null {
  const shared =
    hostname === AFFILIATE_DOMAIN || hostname.endsWith(`.${AFFILIATE_DOMAIN}`)

  return shared ? `.${AFFILIATE_DOMAIN}` : null
}

/** The same cookie the site sets, so the console and the site read each other's. */
export function affiliateCookieFor(code: string, hostname: string): string {
  const attributes = [
    `${AFFILIATE_COOKIE}=${code}`,
    "Path=/",
    `Max-Age=${AFFILIATE_COOKIE_DAYS * SECONDS_PER_DAY}`,
    "SameSite=Lax",
  ]
  const domain = affiliateCookieDomain(hostname)

  if (domain) {
    attributes.push(`Domain=${domain}`)
  }

  return attributes.join("; ")
}

export function readAffiliateCode(): string | null {
  return typeof document === "undefined"
    ? null
    : affiliateCodeFrom(document.cookie)
}

/** The one place the console writes the cookie, so the rule lives here and not in a route. */
export function writeAffiliateCookie(code: string): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the code must survive the sign-in and reach the checkout on another page
  document.cookie = affiliateCookieFor(code, window.location.hostname)
}
