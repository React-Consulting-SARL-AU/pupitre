import {
  BILLING_MODES,
  type BillingMode,
  BillingModeSchema,
  LAUNCH_ADMIN_SEATS,
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

export class LaunchNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`the launch cannot start: ${reason}`)
    this.name = "LaunchNotConfiguredError"
  }
}

export interface BillingModeConfig {
  mode: BillingMode
  launchEndsAt: Date | null
  adminSeats: number
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

const STRIPE_DASHBOARD_LIVE = "https://dashboard.stripe.com"

const STRIPE_TEST_KEY_MARKER = "_test_"

const TRAILING_SLASHES_RE = /\/+$/

/**
 * Where the team reads a subscription at Stripe. The configured key says which
 * of the two dashboards holds it; `STRIPE_DASHBOARD_URL` overrides that reading.
 */
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

function launchEndOf(env: BillingEnv): Date {
  const raw = env.LAUNCH_ENDS_AT

  if (!raw) {
    throw new LaunchNotConfiguredError("LAUNCH_ENDS_AT is not set")
  }

  const date = new Date(raw)

  if (Number.isNaN(date.getTime())) {
    throw new LaunchNotConfiguredError(
      `LAUNCH_ENDS_AT "${raw}" is not an ISO date`
    )
  }

  return date
}

function adminSeatsOf(env: BillingEnv): number {
  const raw = env.LAUNCH_ADMIN_SEATS

  if (!raw) {
    return LAUNCH_ADMIN_SEATS
  }

  const seats = Number(raw)

  if (!Number.isInteger(seats) || seats < 1) {
    throw new LaunchNotConfiguredError(
      `LAUNCH_ADMIN_SEATS "${raw}" is not a positive integer`
    )
  }

  return seats
}

export function billingModeFromEnv(
  env: BillingEnv = process.env
): BillingModeConfig {
  const raw = env.BILLING_MODE ?? "stripe"
  const parsed = BillingModeSchema.safeParse(raw)

  if (!parsed.success) {
    throw new BillingModeInvalidError(raw)
  }

  const adminSeats = adminSeatsOf(env)

  if (parsed.data === "stripe") {
    return { mode: "stripe", launchEndsAt: null, adminSeats }
  }

  return { mode: "launch", launchEndsAt: launchEndOf(env), adminSeats }
}
