import { stripeConfigFromEnv, webhookSecretFromEnv } from "./config"
import type { BillingProvider } from "./provider"
import { createStripeBilling } from "./stripe"

export interface BillingRuntime {
  provider?: BillingProvider
  webhookSecret?: string
}

let provider: BillingProvider | null = null
let webhookSecret: string | null = null

export function configureBilling(runtime: BillingRuntime): void {
  provider = runtime.provider ?? provider
  webhookSecret = runtime.webhookSecret ?? webhookSecret
}

export function resetBilling(): void {
  provider = null
  webhookSecret = null
}

export function getBillingProvider(): BillingProvider {
  provider ??= createStripeBilling(stripeConfigFromEnv())

  return provider
}

export function getWebhookSecret(): string {
  webhookSecret ??= webhookSecretFromEnv()

  return webhookSecret
}
