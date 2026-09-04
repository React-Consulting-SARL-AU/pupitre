import type { BillingCurrency, BillingIntervalName } from "./provider"

export const COUNTRY_HEADER = "cf-ipcountry"

export const SERVER_PRODUCT_NAME = "Serveur"

const USD_COUNTRIES = new Set([
  "AE",
  "AU",
  "BR",
  "CA",
  "HK",
  "IN",
  "JP",
  "MX",
  "NZ",
  "SG",
  "US",
])

export function currencyForCountry(
  country: string | null | undefined
): BillingCurrency {
  if (!country) {
    return "eur"
  }

  return USD_COUNTRIES.has(country.trim().toUpperCase()) ? "usd" : "eur"
}

export function currencyOfRequest(headers: Headers): BillingCurrency {
  return currencyForCountry(headers.get(COUNTRY_HEADER))
}

export type PriceKey = `${BillingCurrency}_${BillingIntervalName}`

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  prices: Record<PriceKey, string>
  appUrl: string
}

export class StripeNotConfiguredError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Stripe is not configured: ${missing.join(", ")}`)
    this.name = "StripeNotConfiguredError"
    this.missing = missing
  }
}

const PRICE_VARIABLES: Record<PriceKey, string> = {
  eur_month: "STRIPE_PRICE_SERVER_EUR_MONTH",
  eur_year: "STRIPE_PRICE_SERVER_EUR_YEAR",
  usd_month: "STRIPE_PRICE_SERVER_USD_MONTH",
  usd_year: "STRIPE_PRICE_SERVER_USD_YEAR",
}

function readEnv(name: string, missing: string[]): string {
  const value = process.env[name]

  if (!value) {
    missing.push(name)

    return ""
  }

  return value
}

export function appUrlFromEnv(): string {
  return process.env.VITE_APP_URL ?? "http://localhost:3000"
}

export function stripeConfigFromEnv(): StripeConfig {
  const missing: string[] = []
  const secretKey = readEnv("STRIPE_SECRET_KEY", missing)
  const webhookSecret = readEnv("STRIPE_WEBHOOK_SECRET", missing)
  const appUrl = appUrlFromEnv()
  const prices = Object.fromEntries(
    Object.entries(PRICE_VARIABLES).map(([key, variable]) => [
      key,
      readEnv(variable, missing),
    ])
  ) as Record<PriceKey, string>

  if (missing.length > 0) {
    throw new StripeNotConfiguredError(missing)
  }

  return { secretKey, webhookSecret, prices, appUrl }
}

export function priceKeyOf(
  currency: BillingCurrency,
  interval: BillingIntervalName
): PriceKey {
  return `${currency}_${interval}`
}

export function webhookSecretFromEnv(): string {
  const missing: string[] = []
  const secret = readEnv("STRIPE_WEBHOOK_SECRET", missing)

  if (missing.length > 0) {
    throw new StripeNotConfiguredError(missing)
  }

  return secret
}
