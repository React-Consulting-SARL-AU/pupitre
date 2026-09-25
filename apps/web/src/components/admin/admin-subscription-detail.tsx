import { useQuery } from "@tanstack/react-query"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminSubscriptionActions } from "@/components/admin/admin-subscription-actions"
import { AdminSubscriptionOverview } from "@/components/admin/admin-subscription-overview"
import { AdminSubscriptionStripeEvents } from "@/components/admin/admin-subscription-stripe-events"
import { PageTabs } from "@/components/ui/page-tabs"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { adminSubscriptionQueryOptions } from "@/lib/api/admin-queries"
import { canActOnPlatform } from "@/lib/domain/admin"

export const ADMIN_SUBSCRIPTION_TABS = [
  "overview",
  "stripe",
  "log",
  "actions",
] as const

export type AdminSubscriptionTab = (typeof ADMIN_SUBSCRIPTION_TABS)[number]

export const ADMIN_SUBSCRIPTION_TAB: AdminSubscriptionTab = "overview"

export function adminSubscriptionTab(value: unknown): AdminSubscriptionTab {
  return (
    ADMIN_SUBSCRIPTION_TABS.find((tab) => tab === value) ??
    ADMIN_SUBSCRIPTION_TAB
  )
}

export interface AdminSubscriptionDetailProps {
  id: string
  tab: AdminSubscriptionTab
  onTabChange: (tab: AdminSubscriptionTab) => void
}

export function AdminSubscriptionDetail({
  id,
  tab,
  onTabChange,
}: AdminSubscriptionDetailProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const subscription = useQuery(adminSubscriptionQueryOptions(id))

  if (subscription.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (subscription.isError) {
    return (
      <AdminFailure
        error={subscription.error}
        fetching={subscription.isFetching}
        onRetry={() => {
          subscription.refetch()
        }}
      />
    )
  }

  const detail = subscription.data
  const acts = canActOnPlatform(platformRole)

  return (
    <PageTabs
      label={t("admin.subscriptions.tabs")}
      onValueChange={(next) => {
        onTabChange(adminSubscriptionTab(next))
      }}
      tabs={[
        {
          value: "overview",
          label: t("admin.subscriptions.tab.overview"),
          panel: <AdminSubscriptionOverview subscription={detail} />,
        },
        {
          value: "stripe",
          label: t("admin.subscriptions.tab.stripe"),
          panel: (
            <AdminSubscriptionStripeEvents events={detail.stripe_events} />
          ),
        },
        {
          value: "log",
          label: t("admin.subscriptions.tab.log"),
          panel: <AdminEventsCard events={detail.events} />,
        },
        ...(acts
          ? [
              {
                value: "actions",
                label: t("admin.subscriptions.tab.actions"),
                panel: <AdminSubscriptionActions subscription={detail} />,
              },
            ]
          : []),
      ]}
      value={tab}
    />
  )
}
