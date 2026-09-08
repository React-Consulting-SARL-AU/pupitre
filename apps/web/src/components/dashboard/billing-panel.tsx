import { useQuery } from "@tanstack/react-query"
import { Lock } from "lucide-react"
import { CheckoutForm } from "@/components/dashboard/checkout-form"
import { SeatBalanceCard } from "@/components/dashboard/seat-balance-card"
import { SubscriptionCard } from "@/components/dashboard/subscription-card"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import {
  serversQueryOptions,
  subscriptionQueryOptions,
} from "@/lib/api/queries"
import { seatBalance, trialDaysLeft } from "@/lib/domain/billing"
import type { Translate } from "@/lib/i18n/i18n"

const SEATED_STATUSES = new Set(["enrolling", "active", "grace", "suspended"])

interface SeatedServer {
  status: string
}

function countSeated(servers: SeatedServer[] | undefined): number {
  return (servers ?? []).filter((server) => SEATED_STATUSES.has(server.status))
    .length
}

function trialNotice(t: Translate, daysLeft: number | null): string {
  const title = t("billing.trialTitle")

  if (daysLeft === null) {
    return title
  }

  const remaining =
    daysLeft === 0
      ? t("billing.trialOver")
      : t.plural("billing.trialLeft", daysLeft)

  return `${title} · ${remaining}`
}

export function BillingPanel() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const canManage = usePermission("billing:manage")
  const organizationId = activeOrganization?.id ?? ""
  const enabled = canManage && organizationId !== ""
  const subscription = useQuery({
    ...subscriptionQueryOptions(organizationId),
    enabled,
  })
  const servers = useQuery({ ...serversQueryOptions(), enabled })

  if (!canManage) {
    return (
      <EmptyState
        description={t("billingPanel.lockedDescription")}
        icon={Lock}
        title={t("billingPanel.lockedTitle")}
      />
    )
  }

  if (!activeOrganization) {
    return (
      <EmptyState
        description={t("billingPanel.noOrganizationDescription")}
        icon={Lock}
        title={t("billingPanel.noOrganizationTitle")}
      />
    )
  }

  if (subscription.isPending || servers.isPending) {
    return <LoadingState label={t("billingPanel.reading")} />
  }

  if (subscription.isError) {
    return (
      <Callout
        fix={t("billingPanel.failedFix")}
        title={t("billingPanel.failed")}
        tone="danger"
      />
    )
  }

  const used = countSeated(servers.data as SeatedServer[] | undefined)
  const paid = subscription.data?.quantity ?? 0
  const trialing = subscription.data?.status === "trialing"
  const daysLeft = trialing
    ? trialDaysLeft(subscription.data?.current_period_end ?? null)
    : null
  const trialTitle = trialNotice(t, daysLeft)

  return (
    <div className="flex flex-col gap-section">
      {trialing ? (
        <Callout fix={t("billing.trialEnds")} title={trialTitle} />
      ) : null}

      {subscription.data ? (
        <SubscriptionCard
          organizationId={activeOrganization.id}
          seatsInUse={used}
          subscription={subscription.data}
        />
      ) : (
        <CheckoutForm
          defaultQuantity={Math.max(used, 1)}
          organizationId={activeOrganization.id}
        />
      )}

      <SeatBalanceCard
        balance={seatBalance(paid, used)}
        paidSeats={subscription.data !== null}
      />
    </div>
  )
}
