import { Link } from "@tanstack/react-router"
import { AdminSubscriptionStatus } from "@/components/admin/admin-subscription-status"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { formatDate, formatProduct } from "@/lib/utils/format"

export interface AdminSubscriptionRowSubscription {
  id: string
  product: string | null
  quantity: number
  status: string
  current_period_end: string | null
  live: boolean
  organization: { id: string; name: string; slug: string }
}

export interface AdminSubscriptionRowProps {
  subscription: AdminSubscriptionRowSubscription
}

export function AdminSubscriptionRow({
  subscription,
}: AdminSubscriptionRowProps) {
  const t = useTranslations()
  const billed = subscription.live
    ? t("admin.subscriptions.live")
    : t("admin.subscriptions.over")

  return (
    <li className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0 sm:gap-6">
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate text-[13px] text-ink underline-offset-2 hover:underline"
          params={{ id: subscription.organization.id }}
          to="/dashboard/admin/organizations/$id"
        >
          {subscription.organization.name}
        </Link>
        <p className="truncate font-data text-[12px] text-ink-3">
          {subscription.organization.slug}
        </p>
      </div>

      <p className="text-[12px] text-ink-2 sm:w-32">
        {formatProduct(subscription.product, t)}
      </p>

      <p className="font-data text-[12px] text-ink-2 tabular-nums sm:w-24">
        {t.plural("admin.links.seats", subscription.quantity)}
      </p>

      <AdminSubscriptionStatus
        className="sm:w-36"
        product={subscription.product}
        status={subscription.status}
      />

      <p className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28">
        {subscription.current_period_end
          ? formatDate(subscription.current_period_end, t)
          : t("format.none")}
      </p>

      <span className="inline-flex items-center gap-2 text-[12px] text-ink-2 sm:w-32">
        <StatusDot
          label={billed}
          shape={subscription.live ? "filled" : "hollow"}
          tone={subscription.live ? "ok" : "muted"}
        />
        {billed}
      </span>

      <Link
        className="text-[12px] text-ink-2 underline-offset-2 hover:underline"
        params={{ id: subscription.id }}
        to="/dashboard/admin/subscriptions/$id"
      >
        {t("admin.subscriptions.open")}
      </Link>
    </li>
  )
}
