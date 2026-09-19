import { AdminSubscriptionStatus } from "@/components/admin/admin-subscription-status"
import type { DataColumn } from "@/components/ui/async-data-table"
import { StatusDot } from "@/components/ui/status-dot"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDate, formatProduct } from "@/lib/utils/format"

export interface AdminSubscriptionRowSubscription {
  id: string
  product: string | null
  status: string
  current_period_end: string | Date | null
  cancel_at_period_end: boolean
  live: boolean
  seats: { paid: number; used: number }
  drifted: boolean
  organization: { id: string; name: string; slug: string }
}

export function adminSubscriptionColumns(
  t: Translate
): DataColumn<AdminSubscriptionRowSubscription>[] {
  return [
    {
      key: "organization",
      header: t("admin.servers.organization"),
      cell: (subscription) => (
        <>
          <span className="block truncate">
            {subscription.organization.name}
          </span>
          <span className="block truncate font-data text-[12px] text-ink-3">
            {subscription.organization.slug}
          </span>
        </>
      ),
    },
    {
      key: "product",
      header: t("admin.subscriptions.productLabel"),
      width: "w-32",
      hideBelow: "md",
      cell: (subscription) => formatProduct(subscription.product, t),
    },
    {
      key: "seats",
      header: t("admin.subscriptions.seatsUsed"),
      width: "w-28",
      align: "end",
      cell: (subscription) => {
        const seats = t("admin.subscriptions.seatsRatio", {
          used: subscription.seats.used,
          paid: subscription.seats.paid,
        })

        return subscription.drifted ? (
          <span className="inline-flex items-center gap-2">
            <StatusDot
              label={t("admin.subscriptions.drifted")}
              shape="hollow"
              tone="warn"
            />
            {seats}
          </span>
        ) : (
          seats
        )
      },
    },
    {
      key: "status",
      header: t("admin.servers.status"),
      width: "w-36",
      cell: (subscription) => (
        <>
          <AdminSubscriptionStatus
            product={subscription.product}
            status={subscription.status}
          />
          {subscription.cancel_at_period_end ? (
            <p className="text-[12px] text-ink-3">
              {t("admin.subscriptions.cancelAtPeriodEnd")}
            </p>
          ) : null}
        </>
      ),
    },
    {
      key: "current_period_end",
      header: t("admin.subscriptions.periodEnd"),
      width: "w-28",
      align: "end",
      sortable: true,
      hideBelow: "lg",
      cell: (subscription) => (
        <span className="font-data text-[12px] text-ink-3">
          {subscription.current_period_end
            ? formatDate(subscription.current_period_end, t)
            : t("format.none")}
        </span>
      ),
    },
    {
      key: "live",
      header: t("admin.subscriptions.live"),
      width: "w-28",
      hideBelow: "lg",
      cell: (subscription) => {
        const billed = subscription.live
          ? t("admin.subscriptions.live")
          : t("admin.subscriptions.over")

        return (
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-2">
            <StatusDot
              label={billed}
              shape={subscription.live ? "filled" : "hollow"}
              tone={subscription.live ? "ok" : "muted"}
            />
            {billed}
          </span>
        )
      },
    },
  ]
}
