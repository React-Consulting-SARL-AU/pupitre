import { Link } from "@tanstack/react-router"
import { ExternalLink } from "lucide-react"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminSubscriptionStatus } from "@/components/admin/admin-subscription-status"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminSubscriptionDetail } from "@/lib/api/admin-queries"
import { formatDateTime, formatProduct } from "@/lib/utils/format"

export interface AdminSubscriptionOverviewProps {
  subscription: AdminSubscriptionDetail
}

export function AdminSubscriptionOverview({
  subscription,
}: AdminSubscriptionOverviewProps) {
  const t = useTranslations()
  const seats = t("admin.subscriptions.seatsRatio", {
    used: subscription.seats.used,
    paid: subscription.seats.paid,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.subscriptions.profile")}</CardTitle>
        <div className="flex items-center gap-3">
          <AdminSubscriptionStatus
            product={subscription.product}
            status={subscription.status}
          />
          {subscription.stripe_url ? (
            <a
              className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              href={subscription.stripe_url}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-4" strokeWidth={1.5} />
              {t("admin.subscriptions.openInStripe")}
            </a>
          ) : null}
        </div>
      </CardHeader>

      <AdminFacts
        facts={[
          {
            label: t("admin.servers.organization"),
            value: (
              <Link
                className="underline-offset-2 hover:underline"
                params={{ id: subscription.organization.id }}
                to="/dashboard/admin/organizations/$id"
              >
                {subscription.organization.name}
              </Link>
            ),
          },
          {
            label: t("admin.subscriptions.productLabel"),
            value: formatProduct(subscription.product, t),
          },
          {
            label: t("admin.subscriptions.seatsUsed"),
            value: subscription.drifted ? (
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
            ),
          },
          {
            label: t("admin.subscriptions.periodEnd"),
            value: subscription.current_period_end
              ? formatDateTime(subscription.current_period_end, t)
              : t("admin.subscriptions.noEnd"),
          },
          {
            label: t("admin.subscriptions.live"),
            value: subscription.live
              ? t("admin.subscriptions.counted")
              : t("admin.subscriptions.over"),
          },
          ...(subscription.cancel_at_period_end
            ? [
                {
                  label: t("admin.subscriptions.cancelAtPeriodEnd"),
                  value: subscription.current_period_end
                    ? formatDateTime(subscription.current_period_end, t)
                    : t("admin.subscriptions.noEnd"),
                },
              ]
            : []),
          {
            label: t("admin.subscriptions.note"),
            value: subscription.note ?? t("format.none"),
          },
          {
            label: t("admin.users.createdAt"),
            value: formatDateTime(subscription.created_at, t),
          },
          {
            label: t("admin.subscriptions.updatedAt"),
            value: formatDateTime(subscription.updated_at, t),
          },
          ...(subscription.platform
            ? []
            : [
                {
                  label: t("admin.subscriptions.stripeId"),
                  value: (
                    <span className="font-data text-[12px]">
                      {subscription.stripe_subscription_id}
                    </span>
                  ),
                },
              ]),
        ]}
      />
    </Card>
  )
}
