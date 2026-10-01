import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  BILLING_MODES,
  type BillingMode,
  BillingModeSchema,
} from "@pupitre/shared/plans"
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

export class BillingModeInvalidError extends Error {
  constructor(value: string) {
    super(`BILLING_MODE "${value}" is not one of ${BILLING_MODES.join(", ")}`)
    this.name = "BillingModeInvalidError"
  }
}

export type BillingEnv = Record<string, string | undefined>

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

export class BillingConfigInvalidError extends Error {
  constructor(variable: string, value: string, expected: string) {
    super(`${variable} "${value}" is not ${expected}`)
    this.name = "BillingConfigInvalidError"
  }
}

export class AppUrlNotConfiguredError extends Error {
  constructor() {
    super(
      `VITE_APP_URL is not set: outside development, the console's address must be configured (${PUPITRE_ORIGINS.app} in production)`
    )
    this.name = "AppUrlNotConfiguredError"
  }
}

const TRAILING_SLASHES_RE = /\/+$/

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url.replace(TRAILING_SLASHES_RE, "")
  }
}

// A deployed platform without a configured origin would send its customers to localhost.
export function appUrlFromEnv(env: BillingEnv = process.env): string {
  const configured = env.VITE_APP_URL?.trim() || env.BETTER_AUTH_URL?.trim()

  if (configured) {
    return originOf(configured)
  }

  if (env.PUPITRE_ENVIRONMENT) {
    throw new AppUrlNotConfiguredError()
  }

  return PUPITRE_ORIGINS.devConsole
}

const DEFAULT_STRIPE_EVENT_LEASE_MINUTES = 5

const MINUTE_MS = 60_000

export function stripeEventLeaseMsFromEnv(
  env: BillingEnv = process.env
): number {
  const raw = env.STRIPE_EVENT_LEASE_MINUTES

  if (!raw) {
    return DEFAULT_STRIPE_EVENT_LEASE_MINUTES * MINUTE_MS
  }

  const minutes = Number(raw)

  if (!(Number.isInteger(minutes) && minutes > 0)) {
    throw new BillingConfigInvalidError(
      "STRIPE_EVENT_LEASE_MINUTES",
      raw,
      "a positive integer"
    )
  }

  return minutes * MINUTE_MS
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

const STRIPE_DASHBOARD_LIVE = "https://dashboard.stripe.com"

const STRIPE_TEST_KEY_MARKER = "_test_"

export function stripeDashboardUrl(env: BillingEnv = process.env): string {
  const configured = env.STRIPE_DASHBOARD_URL?.replace(TRAILING_SLASHES_RE, "")

  if (configured) {
    return configured
  }

  return env.STRIPE_SECRET_KEY?.includes(STRIPE_TEST_KEY_MARKER)
    ? `${STRIPE_DASHBOARD_LIVE}/test`
    : STRIPE_DASHBOARD_LIVE
}

export function stripeSubscriptionUrl(
  stripeSubscriptionId: string,
  env: BillingEnv = process.env
): string {
  const id = encodeURIComponent(stripeSubscriptionId)

  return `${stripeDashboardUrl(env)}/subscriptions/${id}`
}

export function webhookSecretFromEnv(): string {
  const missing: string[] = []
  const secret = readEnv("STRIPE_WEBHOOK_SECRET", missing)

  if (missing.length > 0) {
    throw new StripeNotConfiguredError(missing)
  }

  return secret
}

// Unset means dormant: a platform never reaches Stripe unless it is told to.
export function billingModeFromEnv(env: BillingEnv = process.env): BillingMode {
  const raw = env.BILLING_MODE?.trim() || "off"
  const parsed = BillingModeSchema.safeParse(raw)

  if (!parsed.success) {
    throw new BillingModeInvalidError(raw)
  }

  return parsed.data
}
