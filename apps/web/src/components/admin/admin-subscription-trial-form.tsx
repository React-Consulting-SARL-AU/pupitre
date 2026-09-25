import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { useToast } from "@/hooks/use-toast"
import {
  type AdminSubscription,
  extendSubscriptionTrial,
} from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import { dateInputValue } from "@/lib/domain/admin"
import {
  type TrialEndInput,
  type TrialEndValues,
  trialEndSchema,
} from "@/lib/schemas/admin"
import { formatDate } from "@/lib/utils/format"

export interface AdminSubscriptionTrialFormProps {
  subscriptionId: string
  organization: { id: string; name: string }
  trialEndsAt: string | Date | null
}

export function AdminSubscriptionTrialForm({
  subscriptionId,
  organization,
  trialEndsAt,
}: AdminSubscriptionTrialFormProps) {
  const t = useTranslations()
  const toasts = useToast()
  const held = { ends_at: dateInputValue(trialEndsAt) }
  const form = useForm<TrialEndInput, TrialEndValues>({
    schema: trialEndSchema(t),
    values: held,
  })
  const extend = useOptimisticMutation<TrialEndValues, AdminSubscription>({
    mutationFn: (values) =>
      extendSubscriptionTrial(subscriptionId, values.ends_at),
    invalidate: [
      queryKeys.admin.subscription(subscriptionId),
      queryKeys.admin.allSubscriptions,
      queryKeys.admin.organization(organization.id),
      queryKeys.admin.allServers,
    ],
    onDone: (data) => {
      toasts.done(
        t("admin.subscriptions.trialExtended", {
          organization: organization.name,
          date: data.current_period_end
            ? formatDate(data.current_period_end, t)
            : t("admin.subscriptions.noEnd"),
        })
      )
    },
  })
  const refused = apiFailure(extend.error)

  const submit = form.handleSubmit((values) => {
    extend.mutate(values)
  })
  const unchanged = form.watch("ends_at") === held.ends_at

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.subscriptions.trialZoneTitle")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <p className="text-[13px] text-ink-2">
            {t("admin.subscriptions.trialDescription", {
              organization: organization.name,
            })}
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="trial-ends-at">
              {t("admin.subscriptions.trialUntil")}
            </Label>
            <Input
              className="w-44 font-data tabular-nums"
              id="trial-ends-at"
              type="date"
              {...form.register("ends_at")}
            />
            <FieldError>{form.formState.errors.ends_at?.message}</FieldError>
          </div>

          {extend.isError ? (
            <Callout
              fix={refused?.fix ?? t("admin.subscriptions.trialFailedFix")}
              title={refused?.message ?? t("admin.subscriptions.trialFailed")}
              tone="danger"
            />
          ) : null}

          <div className="flex justify-end border-line border-t pt-gutter">
            <Button
              disabled={unchanged}
              icon={Check}
              loading={extend.isPending}
              type="submit"
              variant="primary"
            >
              {extend.isPending
                ? t("admin.subscriptions.trialing")
                : t("admin.subscriptions.trial")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
