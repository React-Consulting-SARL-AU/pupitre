import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { DEFAULT_LOCALE, LOCALES, type Locale, localizePath } from "./i18n"

export const SITE_URL = PUPITRE_ORIGINS.site

export const OG_DIRECTORY = "og"

export interface AlternateLink {
  hreflang: string
  href: string
}

export function canonicalUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).href
}

export type Translations = Partial<Record<Locale, string>>

export function translatedPath(
  pathname: string,
  locale: Locale,
  translations: Translations = {}
): string {
  return translations[locale] ?? localizePath(pathname, locale)
}

export function alternateLinks(
  pathname: string,
  translations: Translations = {}
): AlternateLink[] {
  const links = LOCALES.map((locale) => ({
    hreflang: locale,
    href: canonicalUrl(translatedPath(pathname, locale, translations)),
  }))

  return [
    ...links,
    {
      hreflang: "x-default",
      href: canonicalUrl(
        translatedPath(pathname, DEFAULT_LOCALE, translations)
      ),
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
