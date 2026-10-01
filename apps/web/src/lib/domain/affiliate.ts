import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AFFILIATE_CODE_RE,
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_DAYS,
} from "@pupitre/shared/plans"
import type { OverviewFigure } from "@/lib/domain/admin"
import type { DictionaryKey } from "@/lib/i18n/en"

const SECONDS_PER_DAY = 86_400

const AFFILIATE_DOMAIN = new URL(PUPITRE_ORIGINS.site).hostname

// Must match the address the platform composes.
export function affiliateUrlFor(code: string): string {
  return `${PUPITRE_ORIGINS.site}/?ref=${encodeURIComponent(code)}`
}

export function isAffiliateCode(value: unknown): value is string {
  return typeof value === "string" && AFFILIATE_CODE_RE.test(value)
}

export const AFFILIATE_LINK_TABS = [
  "overview",
  "organizations",
  "settings",
  "danger",
] as const

export type AffiliateLinkTab = (typeof AFFILIATE_LINK_TABS)[number]

export const AFFILIATE_LINK_TAB: AffiliateLinkTab = "overview"

export function affiliateLinkTab(value: unknown): AffiliateLinkTab {
  return AFFILIATE_LINK_TABS.find((tab) => tab === value) ?? AFFILIATE_LINK_TAB
}

const READER_TABS: AffiliateLinkTab[] = ["overview", "organizations"]

// A reader has no settings nor danger tab: an address naming one opens the overview.
export function affiliateLinkTabFor(
  tab: AffiliateLinkTab,
  canAct: boolean
): AffiliateLinkTab {
  return canAct || READER_TABS.includes(tab) ? tab : AFFILIATE_LINK_TAB
}

export interface AffiliateReach {
  clicks: { total: number; last_30_days: number }
  conversion: { referred: number; servers: number }
}

function figure(
  id: string,
  label: DictionaryKey,
  value: number
): OverviewFigure {
  return { id, label, value, parts: [] }
}

export function affiliateReachFigures({
  clicks,
  conversion,
}: AffiliateReach): OverviewFigure[] {
  return [
    figure("clicks", "admin.links.clicksTotal", clicks.total),
    figure("clicks_30_days", "admin.links.clicks30Days", clicks.last_30_days),
    figure("referred", "admin.links.conversion.referred", conversion.referred),
    figure("servers", "admin.links.conversion.servers", conversion.servers),
  ]
}

export interface AffiliateLinkMatch {
  name: string
  code: string
  partner_name: string | null
  disabled: boolean
}

export interface AffiliateLinkFilter {
  query: string
  disabled: boolean | undefined
}

// The list route takes no query: the page filters the rows it already holds.
export function filterAffiliateLinks<Link extends AffiliateLinkMatch>(
  links: Link[],
  { query, disabled }: AffiliateLinkFilter
): Link[] {
  const needle = query.trim().toLowerCase()

  return links.filter((link) => {
    if (disabled !== undefined && link.disabled !== disabled) {
      return false
    }

    if (needle === "") {
      return true
    }

    return [link.name, link.code, link.partner_name ?? ""].some((field) =>
      field.toLowerCase().includes(needle)
    )
  })
}

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

export function affiliateCookieDomain(hostname: string): string | null {
  const shared =
    hostname === AFFILIATE_DOMAIN || hostname.endsWith(`.${AFFILIATE_DOMAIN}`)

  return shared ? `.${AFFILIATE_DOMAIN}` : null
}

// Must match the cookie the site sets, so each reads the other's.
export function affiliateCookieFor(
  code: string,
  hostname: string,
  secure: boolean
): string {
  const attributes = [
    `${AFFILIATE_COOKIE}=${code}`,
    "Path=/",
    `Max-Age=${AFFILIATE_COOKIE_DAYS * SECONDS_PER_DAY}`,
    "SameSite=Lax",
  ]
  const domain = affiliateCookieDomain(hostname)

  if (secure) {
    attributes.push("Secure")
  }

  if (domain) {
    attributes.push(`Domain=${domain}`)
  }

  return attributes.join("; ")
}

// First touch wins: a later link never takes the credit.
export function affiliateCookieToWrite(
  cookie: string,
  code: string,
  hostname: string,
  secure: boolean
): string | null {
  return affiliateCodeFrom(cookie)
    ? null
    : affiliateCookieFor(code, hostname, secure)
}

export function writeAffiliateCookie(code: string): void {
  const cookie = affiliateCookieToWrite(
    document.cookie,
    code,
    window.location.hostname,
    window.location.protocol === "https:"
  )

  if (cookie) {
    // biome-ignore lint/suspicious/noDocumentCookie: the code must survive the sign-in and reach the platform with the sign-up
    document.cookie = cookie
  }
}
