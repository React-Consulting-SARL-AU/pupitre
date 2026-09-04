export const LOCALES = ["fr", "en"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "fr"

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

function parseAcceptLanguage(header: string): { locale: Locale; q: number }[] {
  return header
    .split(",")
    .map((entry) => {
      const [tag = "", ...params] = entry.trim().split(";")
      const language = tag.trim().toLowerCase().split("-")[0] ?? ""
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
      const q = quality ? Number.parseFloat(quality.slice(2)) : 1

      return { language, q: Number.isNaN(q) ? 0 : q }
    })
    .flatMap(({ language, q }) =>
      isLocale(language) && q > 0 ? [{ locale: language, q }] : []
    )
}

export function localeOf(header: string | null | undefined): Locale {
  if (!header) {
    return DEFAULT_LOCALE
  }

  const candidates = parseAcceptLanguage(header)
  let best: { locale: Locale; q: number } | null = null

  for (const candidate of candidates) {
    if (!best || candidate.q > best.q) {
      best = candidate
    }
  }

  return best?.locale ?? DEFAULT_LOCALE
}

export function resolveLocale(headers: Headers): Locale {
  return localeOf(headers.get("accept-language"))
}

export function localeOrDefault(value: string | null | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE
}
