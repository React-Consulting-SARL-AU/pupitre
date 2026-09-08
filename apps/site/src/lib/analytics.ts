export const CONSENT_KEY = "pupitre_analytics"

export const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com"

export const CONSENT_VALUES = ["granted", "denied"] as const

export type Consent = (typeof CONSENT_VALUES)[number]

export function parseConsent(value: unknown): Consent | null {
  return CONSENT_VALUES.includes(value as Consent) ? (value as Consent) : null
}

export function readConsent(storage: Pick<Storage, "getItem">): Consent | null {
  try {
    return parseConsent(storage.getItem(CONSENT_KEY))
  } catch {
    return null
  }
}

/**
 * Memory persistence is the whole point: PostHog then writes no cookie and no
 * `localStorage` id, so a page view carries no identifier across pages.
 */
export function posthogOptions(host: string): Record<string, unknown> {
  return {
    api_host: host,
    persistence: "memory",
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
  }
}
