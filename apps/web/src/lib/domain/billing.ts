import { type BillingMode, isPlatformProduct } from "@pupitre/shared/plans"
import type { StatusLook } from "@/lib/domain/server-status"

const STATUS_LOOKS: Record<string, StatusLook> = {
  active: { shape: "filled", tone: "ok", label: "billing.status.active" },
  trialing: {
    shape: "breathing",
    tone: "muted",
    label: "billing.status.trialing",
  },
  past_due: { shape: "hollow", tone: "warn", label: "billing.status.past_due" },
  incomplete: {
    shape: "hollow",
    tone: "warn",
    label: "billing.status.incomplete",
  },
  paused: { shape: "hollow", tone: "warn", label: "billing.status.paused" },
  unpaid: { shape: "barred", tone: "danger", label: "billing.status.unpaid" },
  canceled: {
    shape: "barred",
    tone: "muted",
    label: "billing.status.canceled",
  },
  incomplete_expired: {
    shape: "barred",
    tone: "muted",
    label: "billing.status.incomplete_expired",
  },
}

// A status Stripe adds later has no look of ours: null.
export function subscriptionStatusLook(status: string): StatusLook | null {
  return STATUS_LOOKS[status] ?? null
}

export interface PortalSubscription {
  product: string | null
}

// In `off`, the platform refuses the portal: nothing reaches Stripe.
export function opensBillingPortal(
  subscription: PortalSubscription | null | undefined,
  mode: BillingMode | undefined
): boolean {
  return (
    mode === "stripe" &&
    subscription?.product !== null &&
    subscription?.product !== undefined &&
    !isPlatformProduct(subscription.product)
  )
}
