import type { BillingIntervalName } from "./provider"

export interface StripeConfig {
  secretKey: string
  prices: Record<BillingIntervalName, string>
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

const PRICE_VARIABLES: Record<BillingIntervalName, string> = {
  month: "STRIPE_PRICE_SERVER_MONTH",
  year: "STRIPE_PRICE_SERVER_YEAR",
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
  const appUrl = appUrlFromEnv()
  const prices = Object.fromEntries(
    Object.entries(PRICE_VARIABLES).map(([key, variable]) => [
      key,
      readEnv(variable, missing),
    ])
  ) as Record<BillingIntervalName, string>

  if (missing.length > 0) {
    throw new StripeNotConfiguredError(missing)
  }

  return { secretKey, prices, appUrl }
}

export function webhookSecretFromEnv(): string {
  const missing: string[] = []
  const secret = readEnv("STRIPE_WEBHOOK_SECRET", missing)

  if (missing.length > 0) {
    throw new StripeNotConfiguredError(missing)
  }

  return secret
}
