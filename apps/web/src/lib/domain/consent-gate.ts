export const CONSENT_ROUTE = "/auth/consent"

export const ACCOUNT_SETTINGS_ROUTE = "/dashboard/settings"

const TRAILING_SLASH_RE = /(.)\/+$/

export interface ConsentGateInput {
  consent: unknown
  pathname: string
}

// The settings carry the account deletion, which withdraws the consent and so must not need it.
export function opensWithoutConsent(pathname: string): boolean {
  return pathname.replace(TRAILING_SLASH_RE, "$1") === ACCOUNT_SETTINGS_ROUTE
}

export function sendsToConsent({ consent, pathname }: ConsentGateInput) {
  return consent === null && !opensWithoutConsent(pathname)
}
