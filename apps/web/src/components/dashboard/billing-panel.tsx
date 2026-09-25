import { useQuery } from "@tanstack/react-query"
import { Lock, RotateCw } from "lucide-react"
import { CheckoutForm } from "@/components/dashboard/checkout-form"
import { LaunchOffer } from "@/components/dashboard/launch-offer"
import { SeatBalanceCard } from "@/components/dashboard/seat-balance-card"
import { SubscriptionCard } from "@/components/dashboard/subscription-card"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { EmptyState } from "@/components/ui/empty-state"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import {
  isLiveSubscription,
  meQueryOptions,
  serversQueryOptions,
  statusQueryOptions,
  subscriptionQueryOptions,
} from "@/lib/api/queries"
import {
  isLaunchSeatKept,
  isLaunchSubscription,
  seatBalance,
  seatsLocked,
  startOffer,
  trialDaysLeft,
} from "@/lib/domain/billing"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDate } from "@/lib/utils/format"

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

interface LaunchNotice {
  title: string
  fix: string | null
}

function launchNotice(
  t: Translate,
  live: {
    status: string
    product: string | null
    current_period_end: string | null
  }
): LaunchNotice {
  if (isLaunchSeatKept(live)) {
    return { title: t("billing.launchKept"), fix: null }
  }

  const endsAt = live.current_period_end

  return {
    title: endsAt
      ? t("billing.launchUntil", { date: formatDate(endsAt, t) })
      : t("billing.launchTitle"),
    fix: t("billing.launchEnds"),
  }
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
  const status = useQuery(statusQueryOptions())
  const me = useQuery(meQueryOptions())

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

  if (
    subscription.isPending ||
    servers.isPending ||
    status.isPending ||
    me.isPending
  ) {
    return <SkeletonCards label={t("billingPanel.reading")} />
  }

  if (subscription.isError) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={subscription.isFetching}
            onClick={() => {
              subscription.refetch()
            }}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
        fix={t("billingPanel.failedFix")}
        title={t("billingPanel.failed")}
        tone="danger"
      />
    )
  }

  const used = countSeated(servers.data as SeatedServer[] | undefined)
  const live =
    subscription.data && isLiveSubscription(subscription.data)
      ? subscription.data
      : null
  const quota = me.data?.subscription?.servers.limit ?? 0
  const launch = live !== null && isLaunchSubscription(live)
  const trialing = live !== null && !launch && live.status === "trialing"
  const daysLeft = trialing
    ? trialDaysLeft(live?.current_period_end ?? null)
    : null
  const offer = startOffer(status.data?.billing)

  return (
    <div className="flex flex-col gap-section">
      {live && launch ? <Callout {...launchNotice(t, live)} /> : null}

      {trialing ? (
        <Callout
          fix={t("billing.trialEnds")}
          title={trialNotice(t, daysLeft)}
        />
      ) : null}

      {live ? (
        <SubscriptionCard
          launch={launch}
          organizationId={activeOrganization.id}
          seatsInUse={used}
          seatsLocked={seatsLocked(live)}
          subscription={live}
        />
      ) : null}

      {live === null && offer.kind === "launch" ? (
        <LaunchOffer offer={offer} organizationId={activeOrganization.id} />
      ) : null}

      {live === null && offer.kind === "trial" ? (
        <CheckoutForm
          defaultQuantity={Math.max(used, 1)}
          firstCheckout={subscription.data === null}
          organizationId={activeOrganization.id}
        />
      ) : null}

      <SeatBalanceCard
        balance={seatBalance(quota, used)}
        paidSeats={live !== null && !launch}
      />
    </div>
  )
}
