import {
  BILLING_INTERVALS,
  formatUsd,
  TRIAL_DAYS,
  TRIAL_SEATS,
} from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { startCheckout } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import {
  amountUsd,
  type BillingIntervalName,
  INTERVAL_KEYS,
  SEAT_PRICE_USD_PER_MONTH,
} from "@/lib/domain/billing"
import {
  type CheckoutInput,
  type CheckoutValues,
  checkoutSchema,
  MAX_SEATS,
  MIN_SEATS,
} from "@/lib/schemas/billing"

export interface CheckoutFormProps {
  organizationId: string
  defaultQuantity: number
  defaultInterval?: BillingIntervalName
  /** An organization that never subscribed gets the trial: one machine, and the count is not its to choose. */
  firstCheckout?: boolean
}

export function CheckoutForm({
  organizationId,
  defaultQuantity,
  defaultInterval = "month",
  firstCheckout = false,
}: CheckoutFormProps) {
  const t = useTranslations()
  const form = useForm<CheckoutInput, CheckoutValues>({
    schema: checkoutSchema(t),
    defaultValues: {
      quantity: firstCheckout ? TRIAL_SEATS : defaultQuantity,
      interval: defaultInterval,
    },
  })
  const order = useMutation({
    mutationFn: (values: CheckoutValues) =>
      startCheckout(organizationId, values),
    onSuccess: leaveFor,
  })
  const interval = form.watch("interval") as BillingIntervalName
  const quantity = Number(form.watch("quantity"))
  const total = Number.isFinite(quantity) && quantity > 0 ? quantity : 0

  const submit = form.handleSubmit((values) => {
    order.mutate(values)
  })

  const failure = order.isError ? (
    <Callout
      fix={t("checkout.failedFix")}
      title={t("checkout.failed")}
      tone="danger"
    />
  ) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("checkout.title")}</CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {t("checkout.unitPrice", {
            price: formatUsd(SEAT_PRICE_USD_PER_MONTH),
          })}
        </span>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-wrap items-end gap-gutter">
            {firstCheckout ? null : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="quantity">{t("checkout.servers")}</Label>
                <Input
                  className="w-24 font-data tabular-nums"
                  id="quantity"
                  inputMode="numeric"
                  max={MAX_SEATS}
                  min={MIN_SEATS}
                  type="number"
                  {...form.register("quantity")}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>{t("checkout.period")}</Label>
              <SegmentedControl
                onValueChange={(next) => {
                  form.setValue("interval", next)
                }}
                options={BILLING_INTERVALS.map((candidate) => ({
                  value: candidate,
                  label: t(INTERVAL_KEYS[candidate]),
                }))}
                value={interval}
              />
            </div>

            <p className="flex flex-col gap-1">
              <span className="text-label">{t("checkout.total")}</span>
              <span className="font-data text-[12px] text-ink tabular-nums">
                {formatUsd(amountUsd(total, interval))}
                <span className="text-ink-3">
                  {interval === "year"
                    ? t("billing.perYear")
                    : t("billing.perMonth")}
                </span>
              </span>
            </p>
          </div>

          <FieldError>{form.formState.errors.quantity?.message}</FieldError>

          {firstCheckout ? (
            <p className="rounded-md bg-sunken px-3.5 py-2.5 text-[13px] text-ink">
              {t("checkout.firstTrial", {
                days: TRIAL_DAYS,
                seats: TRIAL_SEATS,
              })}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={order.isPending} type="submit" variant="primary">
              <ShoppingCart className="size-4" strokeWidth={1.5} />
              {order.isPending ? t("checkout.opening") : t("checkout.order")}
            </Button>
            <p className="text-[13px] text-ink-2">{t("checkout.lead")}</p>
          </div>

          {failure}
        </form>
      </CardBody>
    </Card>
  )
}
