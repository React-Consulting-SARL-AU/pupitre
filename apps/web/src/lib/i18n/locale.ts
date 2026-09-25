import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie, getRequestHeader } from "@tanstack/react-start/server"
import { DEFAULT_LOCALE, parseLocale } from "./i18n"

export const LOCALE_COOKIE = "pupitre_locale"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

const LOCALE_COOKIE_PATTERN = new RegExp(
  `(?:^|; ?)${LOCALE_COOKIE}=(${LOCALES.join("|")})(?:;|$)`
)

function chosenLocale(cookie: string): Locale | null {
  const match = cookie.match(LOCALE_COOKIE_PATTERN)

  return match ? parseLocale(match[1]) : null
}

export function localeCookie(locale: Locale, secure: boolean): string {
  const attributes = [
    `${LOCALE_COOKIE}=${locale}`,
    "path=/",
    `max-age=${ONE_YEAR_SECONDS}`,
    "samesite=lax",
  ]

  if (secure) {
    attributes.push("secure")
  }

  return attributes.join("; ")
}

export function writeLocaleCookie(locale: Locale): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the console keeps one small preference cookie, and it must survive a reload
  document.cookie = localeCookie(locale, location.protocol === "https:")
}

export function localeFromHeader(header: string | null): Locale {
  if (!header) {
    return DEFAULT_LOCALE
  }

  const wanted = header
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase())

  for (const tag of wanted) {
    for (const locale of LOCALES) {
      if (tag === locale || tag.startsWith(`${locale}-`)) {
        return locale
      }
    }
  }

  return DEFAULT_LOCALE
}

// The browser sends navigator.languages as its Accept-Language, so the page hydrates in the language it was rendered in.
export function browserLocale(
  cookie: string,
  languages: readonly string[]
): Locale {
  return chosenLocale(cookie) ?? localeFromHeader(languages.join(","))
}

export const readLocale = createIsomorphicFn()
  .client((): Locale => browserLocale(document.cookie, navigator.languages))
  .server((): Locale => {
    const chosen = getCookie(LOCALE_COOKIE)

    return chosen
      ? parseLocale(chosen)
      : localeFromHeader(getRequestHeader("accept-language") ?? null)
  })
