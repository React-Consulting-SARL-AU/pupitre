import { DEFAULT_LOCALE, LOCALES, localizePath } from "./i18n"

export const SITE_URL = "https://pupitre.sh"

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
