import { type Dictionary, en } from "../content/ui/en"
import { fr } from "../content/ui/fr"

export const LOCALES = ["en", "fr"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

export type DictionaryKey = keyof Dictionary

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr }

function isLocale(value: string | undefined): value is Locale {
  return LOCALES.includes(value as Locale)
}

export function localeFromPath(pathname: string): Locale {
  const first = pathname.split("/")[1]

  return isLocale(first) ? first : DEFAULT_LOCALE
}

export function stripLocale(pathname: string): string {
  const locale = localeFromPath(pathname)

  if (locale === DEFAULT_LOCALE) {
    return pathname
  }

  return pathname.slice(locale.length + 1) || "/"
}

export function localizePath(pathname: string, locale: Locale): string {
  const bare = stripLocale(pathname)

  return locale === DEFAULT_LOCALE ? bare : `/${locale}${bare}`
}

export function alternateLocale(locale: Locale): Locale {
  return locale === "en" ? "fr" : "en"
}

export function translator(locale: Locale) {
  const dictionary = DICTIONARIES[locale]

  return (key: DictionaryKey): string => dictionary[key]
}
