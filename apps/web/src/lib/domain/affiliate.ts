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

/** The address a link is distributed as, composed the way the platform composes it. */
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

const READER_TABS: AffiliateLinkTab[] = ["overview", "organizations"]

/** A reader of the platform has neither settings nor danger: an address naming one opens the overview. */
export function affiliateLinkTabFor(
  tab: AffiliateLinkTab,
  canAct: boolean
): AffiliateLinkTab {
  return canAct || READER_TABS.includes(tab) ? tab : "overview"
}

export interface AffiliateConversion {
  referred: number
  trialing: number
  active: number
  past_due: number
  canceled: number
  seats: number
}

const CONVERSION_LABELS: [keyof AffiliateConversion, DictionaryKey][] = [
  ["referred", "admin.links.conversion.referred"],
  ["trialing", "admin.links.conversion.trialing"],
  ["active", "admin.links.conversion.active"],
  ["past_due", "admin.links.conversion.pastDue"],
  ["canceled", "admin.links.conversion.canceled"],
  ["seats", "admin.links.conversion.seats"],
]

/** What the link brought, in the order the reader follows it: arrived, then what became of them. */
export function affiliateConversionFigures(
  conversion: AffiliateConversion
): OverviewFigure[] {
  return CONVERSION_LABELS.map(([key, label]) => ({
    id: key,
    label,
    value: conversion[key],
    parts: [],
  }))
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

/** The list route takes no query: the narrowing happens on the rows the page already holds. */
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
