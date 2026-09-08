import type { Locale } from "@pupitre/shared/i18n"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"

export const API_PREFIX = "/api/v1"

/** The marketing site, where the legal pages and the docs live. */
export const SITE_URL = PUPITRE_ORIGINS.site

/** The page that says which server to rent, and where. */
export const VPS_GUIDE_SLUG = "start/vps"

export function docsUrl(slug: string, locale: Locale): string {
  return `${SITE_URL}/${locale === "fr" ? "fr/" : ""}docs/${slug}/`
}

const DEV_ORIGIN = "http://localhost:3000"

export function appOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return import.meta.env.VITE_APP_URL ?? DEV_ORIGIN
}

export function leaveFor(url: string): void {
  window.location.assign(url)
}
