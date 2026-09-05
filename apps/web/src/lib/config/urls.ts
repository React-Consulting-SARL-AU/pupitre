export const API_PREFIX = "/api/v1"

/** The marketing site, where the legal pages and the docs live. */
export const SITE_URL = "https://pupitre.studio"

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
