import { type BillingMode, LAUNCH_ADMIN_SEATS } from "@pupitre/shared/plans"
import {
  type BillingModeConfig,
  billingModeFromEnv,
  stripeConfigFromEnv,
  webhookSecretFromEnv,
} from "./config"
import type { BillingProvider } from "./provider"
import { createStripeBilling } from "./stripe"

export interface BillingRuntime {
  provider?: BillingProvider
  webhookSecret?: string
  mode?: BillingMode
  launchEndsAt?: Date | null
  adminSeats?: number
}

let provider: BillingProvider | null = null
let webhookSecret: string | null = null
let modeConfig: BillingModeConfig | null = null

export function configureBilling(runtime: BillingRuntime): void {
  provider = runtime.provider ?? provider
  webhookSecret = runtime.webhookSecret ?? webhookSecret

  if (runtime.mode) {
    modeConfig = {
      mode: runtime.mode,
      launchEndsAt: runtime.launchEndsAt ?? null,
      adminSeats: runtime.adminSeats ?? LAUNCH_ADMIN_SEATS,
    }
  }
}

export function resetBilling(): void {
  provider = null
  webhookSecret = null
  modeConfig = null
}

export function getBillingProvider(): BillingProvider {
  provider ??= createStripeBilling(stripeConfigFromEnv())

  return provider
}

export function getWebhookSecret(): string {
  webhookSecret ??= webhookSecretFromEnv()

  return webhookSecret
}

export function getBillingMode(): BillingModeConfig {
  modeConfig ??= billingModeFromEnv()

  return modeConfig
}
