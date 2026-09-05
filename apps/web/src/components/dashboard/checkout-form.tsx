import { formatUsd } from "@pupitre/shared/plans"
import { useMutation } from "@tanstack/react-query"
import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { startCheckout } from "@/lib/api/queries"
import { leaveFor } from "@/lib/config/urls"
import {
  amountUsd,
  BILLING_INTERVALS,
  type BillingIntervalName,
  INTERVAL_LABELS,
  SEAT_PRICE_USD_PER_MONTH,
} from "@/lib/domain/billing"
import {
  type CheckoutInput,
  type CheckoutValues,
  checkoutSchema,
  MAX_SEATS,
  MIN_SEATS,
} from "@/lib/schemas/billing"
import { cn } from "@/lib/utils/cn"

export interface CheckoutFormProps {
  organizationId: string
  defaultQuantity: number
}

export function CheckoutForm({
  organizationId,
  defaultQuantity,
}: CheckoutFormProps) {
  const form = useForm<CheckoutInput, CheckoutValues>({
    schema: checkoutSchema,
    defaultValues: { quantity: defaultQuantity, interval: "month" },
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commander des sièges</CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {formatUsd(SEAT_PRICE_USD_PER_MONTH)} par serveur et par mois
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="quantity">Serveurs</Label>
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

            <div className="flex flex-col gap-2">
              <Label>Période</Label>
              <div className="flex h-9 items-center gap-1 rounded-sm border border-line-strong bg-sunken p-1">
                {BILLING_INTERVALS.map((candidate) => (
                  <button
                    aria-pressed={interval === candidate}
                    className={cn(
                      "h-7 rounded-sm px-3 text-[13px] transition-colors duration-[120ms] ease-[ease]",
                      "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
                      interval === candidate
                        ? "bg-inverse text-inverse-ink"
                        : "text-ink-2 hover:bg-raised hover:text-ink"
                    )}
                    key={candidate}
                    onClick={() => {
                      form.setValue("interval", candidate)
                    }}
                    type="button"
                  >
                    {INTERVAL_LABELS[candidate]}
                  </button>
                ))}
              </div>
            </div>

            <p className="flex flex-col gap-1">
              <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                Total
              </span>
              <span className="font-data text-[12px] text-ink tabular-nums">
                {formatUsd(amountUsd(total, interval))}
                <span className="text-ink-3">
                  {interval === "year" ? " par an" : " par mois"}
                </span>
              </span>
            </p>
          </div>

          <FieldError>{form.formState.errors.quantity?.message}</FieldError>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={order.isPending} type="submit" variant="primary">
              <ShoppingCart className="size-4" strokeWidth={1.5} />
              {order.isPending ? "Ouverture de Stripe…" : "Commander"}
            </Button>
            <p className="text-[13px] text-ink-2">
              Le paiement se fait sur Stripe. L'abonnement arrive ici dès que
              Stripe nous l'a confirmé.
            </p>
          </div>

          {order.isError ? (
            <Callout
              fix="Réessayez ; si cela persiste, vérifiez que vous êtes bien propriétaire de cette organisation."
              title="Le paiement n'a pas pu être ouvert."
              tone="danger"
            />
          ) : null}
        </form>
      </CardBody>
    </Card>
  )
}
