import {
  ANNUAL_FREE_MONTHS,
  formatUsd,
  TRIAL_DAYS,
} from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { Check, Rocket } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useTranslations } from "@/hooks/use-locale"
import { startCheckout } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import {
  amountUsd,
  BILLING_INTERVALS,
  type BillingIntervalName,
  INTERVAL_KEYS,
} from "@/lib/domain/billing"
import type { DictionaryKey } from "@/lib/i18n/en"

const PROMISES: DictionaryKey[] = [
  "start.gives.enrol",
  "start.gives.catalogue",
  "start.gives.yours",
]

const AFTER_TRIAL_KEYS: Record<BillingIntervalName, DictionaryKey> = {
  month: "start.afterTrial.month",
  year: "start.afterTrial.year",
}

export interface TrialOfferProps {
  organizationId: string
}

export function TrialOffer({ organizationId }: TrialOfferProps) {
  const t = useTranslations()
  const [interval, chooseInterval] = useState<BillingIntervalName>("month")
  const order = useMutation({
    mutationFn: () =>
      startCheckout(organizationId, {
        quantity: 1,
        interval,
        return_to: "start",
      }),
    onSuccess: leaveFor,
  })

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-bold font-display text-[18px] text-ink leading-[1.2] tracking-[-0.01em]">
            {t("start.trialTitle")}
          </h2>
          <span className="shrink-0 rounded-full bg-raised px-3 py-1 font-data text-[11px] text-ink-2 tabular-nums">
            {t("start.trialBadge", { days: TRIAL_DAYS })}
          </span>
        </div>

        <ul className="flex flex-col gap-3">
          {PROMISES.map((promise) => (
            <li className="flex items-start gap-3" key={promise}>
              <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken">
                <Check className="size-3.5 text-ink-2" strokeWidth={1.5} />
              </span>
              <span className="text-[13px] text-ink-2">{t(promise)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <Label>{t("checkout.period")}</Label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SegmentedControl
              onValueChange={chooseInterval}
              options={BILLING_INTERVALS.map((candidate) => ({
                value: candidate,
                label: t(INTERVAL_KEYS[candidate]),
              }))}
              value={interval}
            />
            <span className="font-data text-[12px] text-ink-2 tabular-nums">
              {t(AFTER_TRIAL_KEYS[interval], {
                price: formatUsd(amountUsd(1, interval)),
                months: ANNUAL_FREE_MONTHS,
              })}
            </span>
          </div>
        </div>

        <p className="rounded-md bg-sunken px-3.5 py-2.5 text-[13px] text-ink">
          {t("start.noCard", { days: TRIAL_DAYS })}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            className="h-10 w-full"
            disabled={order.isPending}
            onClick={() => {
              order.mutate()
            }}
            variant="primary"
          >
            <Rocket className="size-4" strokeWidth={1.5} />
            {order.isPending ? t("start.actionPending") : t("start.action")}
          </Button>
        </div>

        {order.isError ? (
          <Callout
            fix={t("start.failedFix")}
            title={t("start.failed")}
            tone="danger"
          />
        ) : null}
      </div>
    </Card>
  )
}
