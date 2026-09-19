import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { AdminSubscriptionDetail } from "@/lib/api/admin-queries"
import { stripeEventStatusKey } from "@/lib/domain/admin"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminSubscriptionStripeEventsProps {
  events: AdminSubscriptionDetail["stripe_events"]
}

export function AdminSubscriptionStripeEvents({
  events,
}: AdminSubscriptionStripeEventsProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.subscriptions.stripeEvents")}</CardTitle>
      </CardHeader>

      {events.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            {t("admin.subscriptions.noStripeEvent")}
          </p>
        </CardBody>
      ) : (
        <ul>
          {events.map((event) => {
            const status = stripeEventStatusKey(event.status)

            return (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={event.id}
              >
                <span className="min-w-0 flex-1 truncate font-data text-[13px] text-ink">
                  {event.type}
                </span>
                <span className="text-[12px] text-ink-2 sm:w-40">
                  {status ? t(status) : event.status}
                </span>
                <span className="font-data text-[12px] text-ink-3 tabular-nums">
                  {formatDateTime(event.received_at, t)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
