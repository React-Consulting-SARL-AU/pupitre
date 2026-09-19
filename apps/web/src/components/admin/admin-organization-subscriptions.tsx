import { Link } from "@tanstack/react-router"
import { AdminGrantDialog } from "@/components/admin/admin-grant-dialog"
import { AdminSubscriptionStatus } from "@/components/admin/admin-subscription-status"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminOrganizationDetail } from "@/lib/api/admin-queries"
import { subscriptionIsLive } from "@/lib/domain/admin"
import { formatDate, formatProduct } from "@/lib/utils/format"

export interface AdminOrganizationSubscriptionsProps {
  detail: AdminOrganizationDetail
  acts: boolean
}

export function AdminOrganizationSubscriptions({
  detail,
  acts,
}: AdminOrganizationSubscriptionsProps) {
  const t = useTranslations()
  const hasLive = detail.subscription
    ? subscriptionIsLive(detail.subscription.status)
    : false

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.organizations.subscriptions")}</CardTitle>
        {acts ? (
          <AdminGrantDialog blocked={hasLive} organization={detail} />
        ) : null}
      </CardHeader>

      {detail.subscriptions.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.organizations.noSubscription")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {detail.subscriptions.map((subscription) => (
            <li
              className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={subscription.id}
            >
              <Link
                className="min-w-0 flex-1 truncate font-data text-[12px] text-ink underline-offset-2 hover:underline"
                params={{ id: subscription.id }}
                to="/dashboard/admin/subscriptions/$id"
              >
                {subscription.stripe_subscription_id}
              </Link>
              <span className="text-[12px] text-ink-2 sm:w-32">
                {formatProduct(subscription.product, t)}
              </span>
              <span className="font-data text-[12px] text-ink-2 tabular-nums sm:w-24">
                {t.plural("admin.links.seats", subscription.quantity)}
              </span>
              <AdminSubscriptionStatus
                className="sm:w-36"
                product={subscription.product}
                status={subscription.status}
              />
              <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                {subscription.current_period_end
                  ? formatDate(subscription.current_period_end, t)
                  : t("format.none")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
