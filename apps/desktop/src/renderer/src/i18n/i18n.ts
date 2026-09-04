import { type Dictionary, type DictionaryKey, en } from "./en";
import { fr } from "./fr";

export const LOCALES = ["en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

export function systemLocale(): Locale {
  try {
    return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  } catch {
    return DEFAULT_LOCALE;
  }
}

const PLACEHOLDER_RE = /\{(\w+)\}/g;

export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = values[key];

    if (value === undefined) {
      throw new Error(`Missing value for "${key}"`);
    }

    return String(value);
  });
}

export type Translate = (
  key: DictionaryKey,
  values?: Record<string, string | number>
) => string;

export function translator(locale: Locale): Translate {
  const dictionary = DICTIONARIES[locale];

  return (key, values) => {
    const template = dictionary[key];

    return values ? fill(template, values) : template;
  };
}
