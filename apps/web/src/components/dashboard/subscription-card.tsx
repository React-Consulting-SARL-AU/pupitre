import { formatUsd } from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"
import { SeatQuantityForm } from "@/components/dashboard/seat-quantity-form"
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
import { formatDate, formatDateTime } from "@/lib/utils/format"

export interface SubscriptionCardSubscription {
  quantity: number
  status: string
  product: string | null
  interval: string | null
  current_period_end: string | null
}

export interface SubscriptionCardProps {
  organizationId: string
  subscription: SubscriptionCardSubscription
  seatsInUse: number
  /** The platform's own launch subscription: nothing to pay, no portal, no seats to change. */
  launch: boolean
  /** A trial holds one machine: the seat form waits for the first payment. */
  seatsLocked: boolean
}

function intervalOf(value: string | null): BillingIntervalName | null {
  return isBillingIntervalName(value) ? value : null
}

const FACT = "text-[10.5px] text-ink-3 uppercase tracking-[0.08em]"

export function SubscriptionCard({
  organizationId,
  subscription,
  seatsInUse,
  launch,
  seatsLocked,
}: SubscriptionCardProps) {
  const t = useTranslations()
  const portal = useMutation({
    mutationFn: () => openBillingPortal(organizationId),
    onSuccess: leaveFor,
  })
  const interval = intervalOf(subscription.interval)
  const seats = subscription.quantity
  const endsAt = subscription.current_period_end

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("billing.subscription")}</CardTitle>
        <StatusBadge
          look={subscriptionStatusLook(
            subscription.status,
            subscription.product
          )}
        />
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <dl className="grid gap-gutter sm:grid-cols-2">
          <div>
            <dt className={FACT}>{t("billing.seats")}</dt>
            <dd className="mt-1 font-data text-[12px] text-ink tabular-nums">
              {t.plural("billing.seat", seats)}
            </dd>
          </div>

          {launch ? (
            <div>
              <dt className={FACT}>{t("billing.period")}</dt>
              <dd className="mt-1 text-[13px] text-ink-2">
                {endsAt
                  ? t("billing.launchUntil", { date: formatDate(endsAt, t) })
                  : t("billing.launchTitle")}
              </dd>
            </div>
          ) : (
            <>
              <div>
                <dt className={FACT}>{t("billing.amount")}</dt>
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
                <dt className={FACT}>{t("billing.period")}</dt>
                <dd className="mt-1 text-[13px] text-ink-2">
                  {interval
                    ? t(INTERVAL_KEYS[interval])
                    : t("billing.periodUnknown")}
                  {endsAt
                    ? t("billing.until", { date: formatDateTime(endsAt, t) })
                    : null}
                </dd>
              </div>
            </>
          )}
        </dl>

        {seatsLocked ? (
          <p className="border-line border-t pt-gutter text-[13px] text-ink-2">
            {launch ? t("billing.launchSeats") : t("billing.seatsLocked")}
          </p>
        ) : (
          <SeatQuantityForm
            organizationId={organizationId}
            quantity={seats}
            seatsInUse={seatsInUse}
          />
        )}

        {launch ? null : (
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
        )}

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
