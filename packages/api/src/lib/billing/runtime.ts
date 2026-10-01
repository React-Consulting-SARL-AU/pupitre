import type { BillingMode } from "@pupitre/shared/plans"
import {
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
}

let provider: BillingProvider | null = null
let webhookSecret: string | null = null
let mode: BillingMode | null = null

export function configureBilling(runtime: BillingRuntime): void {
  provider = runtime.provider ?? provider
  webhookSecret = runtime.webhookSecret ?? webhookSecret
  mode = runtime.mode ?? mode
}

export function resetBilling(): void {
  provider = null
  webhookSecret = null
  mode = null
}

export function getBillingProvider(): BillingProvider {
  provider ??= createStripeBilling(stripeConfigFromEnv())

  return provider
}

export function getWebhookSecret(): string {
  webhookSecret ??= webhookSecretFromEnv()

  return webhookSecret
}

export function getBillingMode(): BillingMode {
  mode ??= billingModeFromEnv()

  return mode
}

export class BillingOffError extends Error {
  constructor() {
    super("billing is off: the platform sells nothing and never calls Stripe")
    this.name = "BillingOffError"
  }
}

export function assertBillingOn(): void {
  if (getBillingMode() === "off") {
    throw new BillingOffError()
  }
}
