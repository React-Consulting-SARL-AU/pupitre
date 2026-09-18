import { TRIAL_SEATS } from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { Check, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import { startCheckout } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import { START_PROMISES, type StartOffer } from "@/lib/domain/billing"
import { formatDate } from "@/lib/utils/format"

export interface LaunchOfferProps {
  organizationId: string
  offer: StartOffer
}

/** The launch grants one machine for free, without Stripe: no price, no interval, one gesture. */
export function LaunchOffer({ organizationId, offer }: LaunchOfferProps) {
  const t = useTranslations()
  const order = useMutation({
    mutationFn: () =>
      startCheckout(organizationId, {
        quantity: TRIAL_SEATS,
        interval: "month",
        return_to: "start",
      }),
    onSuccess: leaveFor,
  })

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-bold font-display text-[18px] text-ink leading-[1.2] tracking-[-0.01em]">
            {t(offer.title)}
          </h2>
          <span className="shrink-0 rounded-full bg-raised px-3 py-1 font-data text-[11px] text-ink-2 tabular-nums">
            {t.plural("start.trialSeats", TRIAL_SEATS)}
          </span>
        </div>

        <p className="font-data text-[12px] text-ink-2 tabular-nums">
          {offer.endsAt
            ? t("start.launchUntil", { date: formatDate(offer.endsAt, t) })
            : t("start.launchOpen")}
        </p>

        <ul className="flex flex-col gap-3">
          {START_PROMISES.map((promise) => (
            <li className="flex items-start gap-3" key={promise}>
              <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken">
                <Check className="size-3.5 text-ink-2" strokeWidth={1.5} />
              </span>
              <span className="text-[13px] text-ink-2">{t(promise)}</span>
            </li>
          ))}
        </ul>

        <p className="rounded-md bg-sunken px-3.5 py-2.5 text-[13px] text-ink">
          {t("start.launchLead")}
        </p>

        <Button
          className="h-10 w-full"
          disabled={order.isPending}
          onClick={() => {
            order.mutate()
          }}
          variant="primary"
        >
          <Rocket className="size-4" strokeWidth={1.5} />
          {order.isPending ? t(offer.actionPending) : t(offer.action)}
        </Button>

        {order.isError ? (
          <Callout
            fix={t("start.failedFix")}
            title={t(offer.failed)}
            tone="danger"
          />
        ) : null}
      </div>
    </Card>
  )
}
