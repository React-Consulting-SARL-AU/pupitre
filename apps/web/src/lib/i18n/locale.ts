import { LOCALES, type Locale } from "@pupitre/shared/i18n"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie, getRequestHeader } from "@tanstack/react-start/server"
import { DEFAULT_LOCALE, parseLocale } from "./i18n"

export const LOCALE_COOKIE = "pupitre_locale"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function localeFromCookie(cookie: string): Locale {
  const match = cookie.match(
    new RegExp(`(?:^|; ?)${LOCALE_COOKIE}=(${LOCALES.join("|")})(?:;|$)`)
  )

  return parseLocale(match?.[1])
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

/** The one place that writes the cookie, so the rule lives here and not in a hook. */
export function writeLocaleCookie(locale: Locale): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the console keeps one small preference cookie, and it must survive a reload
  document.cookie = localeCookie(locale, location.protocol === "https:")
}

/** What the browser asks for, when nothing was chosen yet. */
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

/**
 * The locale of this request. On the server it comes from the cookie, or from
 * what the browser asks for when nothing was chosen yet; on the client it comes
 * from the same cookie, so the page hydrates in the language it was rendered in.
 */
export const readLocale = createIsomorphicFn()
  .client((): Locale => localeFromCookie(document.cookie))
  .server((): Locale => {
    const chosen = getCookie(LOCALE_COOKIE)

    return chosen
      ? parseLocale(chosen)
      : localeFromHeader(getRequestHeader("accept-language") ?? null)
  })
