import { DEFAULT_LOCALE, LOCALES, localizePath } from "./i18n"

export const SITE_URL = "https://pupitre.studio"

export const OG_DIRECTORY = "og"

export interface AlternateLink {
  hreflang: string
  href: string
}

export function canonicalUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).href
}

export function alternateLinks(pathname: string): AlternateLink[] {
  const links = LOCALES.map((locale) => ({
    hreflang: locale,
    href: canonicalUrl(localizePath(pathname, locale)),
  }))

  return [
    ...links,
    {
      hreflang: "x-default",
      href: canonicalUrl(localizePath(pathname, DEFAULT_LOCALE)),
    },
  ]
}

export function ogSlug(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "")

  return trimmed === "" ? "index" : trimmed
}

export function ogUrl(pathname: string): string {
  return canonicalUrl(`/${OG_DIRECTORY}/${ogSlug(pathname)}.png`)
}
