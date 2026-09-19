import { Link } from "@tanstack/react-router"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { productKey } from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { formatDate } from "@/lib/utils/format"

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
  const look = subscriptionStatusLook(subscription.status, subscription.product)
  const product = productKey(subscription.product)
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
        {product ? t(product) : (subscription.product ?? t("format.none"))}
      </p>

      <p className="font-data text-[12px] text-ink-2 tabular-nums sm:w-24">
        {t.plural("admin.links.seats", subscription.quantity)}
      </p>

      {look ? (
        <StatusBadge className="sm:w-36" look={look} />
      ) : (
        <p className="font-data text-[12px] text-ink-2 sm:w-36">
          {subscription.status}
        </p>
      )}

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
    </li>
  )
}
