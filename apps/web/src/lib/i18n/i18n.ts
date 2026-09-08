import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { type Dictionary, type DictionaryKey, en } from "./en"
import { fr } from "./fr"

/** The console was written in French first, and falls back to it. */
export const DEFAULT_LOCALE: Locale = "en"

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr }

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale)
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

const PLACEHOLDER_RE = /\{(\w+)\}/g

export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = values[key]

    if (value === undefined) {
      throw new Error(`Missing value for "${key}"`)
    }

    return String(value)
  })
}

type Values = Record<string, string | number>

export interface Translate {
  (key: DictionaryKey, values?: Values): string
  /** The locale this translator speaks, for `Intl` and for anything date-shaped. */
  locale: Locale
  /**
   * Picks `<key>.one` or `<key>.other` by the locale's own rule and fills
   * `{count}`. French counts 0 and 1 as singular, English only 1.
   */
  plural(key: string, count: number, values?: Values): string
}

function pluralForm(locale: Locale, count: number): "one" | "other" {
  const singular = locale === "fr" ? count <= 1 : count === 1

  return singular ? "one" : "other"
}

export function translator(locale: Locale): Translate {
  const dictionary = DICTIONARIES[locale]

  const translate = ((key: DictionaryKey, values?: Values): string => {
    const template = dictionary[key]

    return values ? fill(template, values) : template
  }) as Translate

  translate.locale = locale

  translate.plural = (key, count, values) => {
    const form = pluralForm(locale, count)

    return translate(`${key}.${form}` as DictionaryKey, { count, ...values })
  }

  return translate
}
