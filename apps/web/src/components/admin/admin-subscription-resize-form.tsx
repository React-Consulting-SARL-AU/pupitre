import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminSubscription,
  resizeSubscription,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { dateInputValue } from "@/lib/domain/admin"
import {
  type ResizeSubscriptionInput,
  type ResizeSubscriptionValues,
  resizeSubscriptionSchema,
} from "@/lib/schemas/admin"
import { MAX_SEATS, MIN_SEATS } from "@/lib/schemas/billing"

export interface AdminSubscriptionResizeFormProps {
  subscriptionId: string
  organization: { id: string; name: string }
  quantity: number
  endsAt: string | Date | null
}

/** The seats and the end of a granted subscription; nothing else on it is the team's to move. */
export function AdminSubscriptionResizeForm({
  subscriptionId,
  organization,
  quantity,
  endsAt,
}: AdminSubscriptionResizeFormProps) {
  const t = useTranslations()
  const held = { seats: quantity, ends_at: dateInputValue(endsAt) }
  const form = useForm<ResizeSubscriptionInput, ResizeSubscriptionValues>({
    schema: resizeSubscriptionSchema(t),
    values: held,
  })
  const resize = useOptimisticMutation<
    ResizeSubscriptionValues,
    AdminSubscription
  >({
    mutationFn: (values) => resizeSubscription(subscriptionId, values),
    invalidate: [
      queryKeys.admin.subscription(subscriptionId),
      queryKeys.admin.allSubscriptions,
      queryKeys.admin.organization(organization.id),
    ],
    toast: {
      done: () =>
        t("admin.subscriptions.resized", { organization: organization.name }),
      failed: () => ({
        title: t("admin.subscriptions.resizeFailed"),
        fix: t("admin.subscriptions.resizeFailedFix"),
      }),
    },
  })

  const submit = form.handleSubmit((values) => {
    resize.mutate(values)
  })
  const wanted = form.watch()
  const unchanged =
    Number(wanted.seats) === held.seats && wanted.ends_at === held.ends_at

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.subscriptions.resizeZoneTitle")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-wrap items-start gap-gutter">
            <div className="flex flex-col gap-2">
              <Label htmlFor="resize-seats">
                {t("admin.subscriptions.seats")}
              </Label>
              <Input
                className="w-24 font-data tabular-nums"
                id="resize-seats"
                inputMode="numeric"
                max={MAX_SEATS}
                min={MIN_SEATS}
                type="number"
                {...form.register("seats")}
              />
              <FieldError>{form.formState.errors.seats?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="resize-ends-at">
                {t("admin.subscriptions.endsAtOptional")}
              </Label>
              <Input
                className="w-44 font-data tabular-nums"
                id="resize-ends-at"
                type="date"
                {...form.register("ends_at")}
              />
              <FieldError>{form.formState.errors.ends_at?.message}</FieldError>
            </div>
          </div>

          <div className="flex justify-end border-line border-t pt-gutter">
            <Button
              disabled={unchanged}
              icon={Check}
              loading={resize.isPending}
              type="submit"
              variant="primary"
            >
              {resize.isPending
                ? t("admin.subscriptions.resizing")
                : t("admin.subscriptions.resizeAction")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
