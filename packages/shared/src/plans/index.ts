import { z } from "zod"
import { InstantSchema } from "../platform-api"

// Every organization runs this many servers for free; a licence adds seats beyond them.
export const FREE_SERVERS = 3

export const BILLING_INTERVALS = ["month", "year"] as const

export const BillingIntervalSchema = z.enum(BILLING_INTERVALS)

export type BillingInterval = z.infer<typeof BillingIntervalSchema>

// `off` sells nothing: licences beyond the free servers are only granted by the platform.
export const BILLING_MODES = ["stripe", "off"] as const

export const BillingModeSchema = z.enum(BILLING_MODES)

export type BillingMode = z.infer<typeof BillingModeSchema>

export const GRANTED_PRODUCT = "granted"

// No Stripe counterpart: never reconciled, never resized, never given a portal.
export const PLATFORM_PRODUCTS: readonly string[] = [GRANTED_PRODUCT]

// Stripe still bills under these: an organization's licence is the last touched of them.
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"]

export function isLiveSubscriptionStatus(status: string): boolean {
  return LIVE_SUBSCRIPTION_STATUSES.includes(status)
}

// The platform lists them per row; the console only shows them.
export const SUBSCRIPTION_ACTIONS = [
  "resize",
  "resume",
  "cancel",
  "delete",
] as const

export type SubscriptionAction = (typeof SUBSCRIPTION_ACTIONS)[number]

export function isPlatformProduct(product: string): boolean {
  return PLATFORM_PRODUCTS.includes(product)
}

// Stripe renames its own products, so a row it bills is labelled by this rather than by their identifier.
export const STRIPE_PRODUCT = "stripe"

// The platform's own organization enrols what it needs without a licence.
export const PLATFORM_ORGANIZATION_SEATS = 100

export const AFFILIATE_CODE_LENGTH = 8

export const AFFILIATE_CODE_RE = /^[a-z0-9-]{3,32}$/

export const AFFILIATE_COOKIE = "pupitre_ref"

export const AFFILIATE_COOKIE_DAYS = 90

export const AFFILIATE_PARTNER_NAME_MAX_LENGTH = 120

export const AFFILIATE_NOTES_MAX_LENGTH = 2000

// Day buckets, today included.
export const AFFILIATE_CLICK_WINDOW_DAYS = 30

export const MeServersSchema = z.object({
  used: z.int().nonnegative(),
  limit: z.int().nonnegative(),
})

export type MeServers = z.infer<typeof MeServersSchema>

// The seats a licence adds to the free servers; Solo and Team are gone, the mirror names no plan.
export const MeLicenseGrantSchema = z.object({
  status: z.string().min(1),
  seats: z.int().nonnegative(),
  current_period_end: InstantSchema.nullable(),
})

export type MeLicenseGrant = z.infer<typeof MeLicenseGrantSchema>
