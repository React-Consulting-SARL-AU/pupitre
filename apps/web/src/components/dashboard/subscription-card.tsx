import { formatUsd } from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import { openBillingPortal } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import {
  amountUsd,
  type BillingIntervalName,
  INTERVAL_KEYS,
  isBillingIntervalName,
  subscriptionStatusLook,
} from "@/lib/domain/billing"
import { formatDateTime } from "@/lib/utils/format"

export interface SubscriptionCardSubscription {
  product: string
  quantity: number
  status: string
  interval: string | null
  current_period_end: string | null
}

export interface SubscriptionCardProps {
  organizationId: string
  subscription: SubscriptionCardSubscription
}

function intervalOf(value: string | null): BillingIntervalName | null {
  return isBillingIntervalName(value) ? value : null
}

export function SubscriptionCard({
  organizationId,
  subscription,
}: SubscriptionCardProps) {
  const t = useTranslations()
  const portal = useMutation({
    mutationFn: () => openBillingPortal(organizationId),
    onSuccess: leaveFor,
  })
  const interval = intervalOf(subscription.interval)
  const seats = subscription.quantity

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("billing.subscription")}</CardTitle>
        <StatusBadge look={subscriptionStatusLook(subscription.status)} />
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <dl className="grid gap-gutter sm:grid-cols-2">
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {t("billing.product")}
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink">
              {subscription.product}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {t("billing.seats")}
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink tabular-nums">
              {t.plural("billing.seat", seats)}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {t("billing.amount")}
            </dt>
            <dd className="mt-1 font-data text-[12px] text-ink tabular-nums">
              {formatUsd(amountUsd(seats, interval))}
              <span className="text-ink-3">
                {interval === "year"
                  ? t("billing.perYear")
                  : t("billing.perMonth")}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {t("billing.period")}
            </dt>
            <dd className="mt-1 text-[13px] text-ink-2">
              {interval
                ? t(INTERVAL_KEYS[interval])
                : t("billing.periodUnknown")}
              {subscription.current_period_end
                ? t("billing.until", {
                    date: formatDateTime(subscription.current_period_end, t),
                  })
                : null}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={portal.isPending}
            onClick={() => {
              portal.mutate()
            }}
            variant="primary"
          >
            <CreditCard className="size-4" strokeWidth={1.5} />
            {portal.isPending
              ? t("billing.portalOpening")
              : t("billing.portal")}
          </Button>
          <p className="text-[13px] text-ink-2">{t("billing.portalLead")}</p>
        </div>

        {portal.isError ? (
          <Callout
            fix={t("billing.portalFailedFix")}
            title={t("billing.portalFailed")}
            tone="danger"
          />
        ) : null}
      </CardBody>
    </Card>
  )
}
