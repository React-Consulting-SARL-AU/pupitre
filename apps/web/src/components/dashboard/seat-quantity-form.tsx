import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { queryKeys, type Subscription, updateSeats } from "@/lib/api/queries"
import {
  MAX_SEATS,
  MIN_SEATS,
  type SeatsInput,
  type SeatsValues,
  seatsSchema,
} from "@/lib/schemas/billing"

export interface SeatQuantityFormProps {
  organizationId: string
  quantity: number
  seatsInUse: number
  trialing: boolean
}

export function SeatQuantityForm({
  organizationId,
  quantity,
  seatsInUse,
  trialing,
}: SeatQuantityFormProps) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const minimum = Math.max(seatsInUse, MIN_SEATS)
  const form = useForm<SeatsInput, SeatsValues>({
    schema: seatsSchema(t, minimum),
    values: { quantity },
  })
  const update = useOptimisticMutation<SeatsValues, Subscription | null>({
    mutationFn: (values) => updateSeats(organizationId, values.quantity),
    onDone: (subscription) => {
      queryClient.setQueryData(
        queryKeys.subscription(organizationId),
        subscription
      )
    },
    invalidate: [queryKeys.me],
    toast: {
      done: (_data, values) =>
        t.plural("billing.seatsUpdated", values.quantity),
      failed: () => ({
        title: t("billing.seatsFailed"),
        fix: t("billing.seatsFailedFix"),
      }),
    },
  })

  const submit = form.handleSubmit((values) => {
    update.mutate(values)
  })
  const wanted = Number(form.watch("quantity"))
  const unchanged = !Number.isFinite(wanted) || wanted === quantity

  return (
    <form
      className="flex flex-col gap-3 border-line border-t pt-gutter"
      noValidate
      onSubmit={(event) => {
        submit(event)
      }}
    >
      <div className="flex flex-wrap items-end gap-gutter">
        <div className="flex flex-col gap-2">
          <Label htmlFor="seats">{t("billing.seatsAdjust")}</Label>
          <Input
            className="w-24 font-data tabular-nums"
            id="seats"
            inputMode="numeric"
            max={MAX_SEATS}
            min={minimum}
            type="number"
            {...form.register("quantity")}
          />
        </div>

        <Button disabled={unchanged} loading={update.isPending} type="submit">
          {update.isPending
            ? t("billing.seatsUpdating")
            : t("billing.seatsUpdate")}
        </Button>

        <p className="max-w-[52ch] flex-1 text-[13px] text-ink-2">
          {trialing ? t("billing.seatsTrialLead") : t("billing.seatsLead")}
        </p>
      </div>

      <FieldError>{form.formState.errors.quantity?.message}</FieldError>
    </form>
  )
}
