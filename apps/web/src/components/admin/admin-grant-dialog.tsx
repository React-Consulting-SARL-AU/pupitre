import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Gift } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import {
  DialogClose,
  DialogPopup,
  DialogRoot,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { grantSubscription } from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import { isPlatformOrganization } from "@/lib/domain/admin"
import {
  type GrantSubscriptionInput,
  type GrantSubscriptionValues,
  grantSubscriptionSchema,
  MAX_SEATS,
  MAX_SUBSCRIPTION_NOTE_LENGTH,
  MIN_SEATS,
} from "@/lib/schemas/admin"

export interface AdminGrantDialogOrganization {
  id: string
  name: string
}

export interface AdminGrantDialogProps {
  organization: AdminGrantDialogOrganization
  blocked: boolean
  onGranted?: () => Promise<void> | void
}

const EMPTY: GrantSubscriptionInput = {
  seats: MIN_SEATS,
  ends_at: "",
  note: "",
}

export function AdminGrantDialog({
  organization,
  blocked,
  onGranted,
}: AdminGrantDialogProps) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const toasts = useToast()
  const [open, setOpen] = useState(false)
  const prefix = `grant-${organization.id}`
  const form = useForm<GrantSubscriptionInput, GrantSubscriptionValues>({
    schema: grantSubscriptionSchema(t),
    defaultValues: EMPTY,
  })
  const grant = useMutation({
    mutationFn: (values: GrantSubscriptionValues) =>
      grantSubscription(organization.id, {
        seats: values.seats,
        ends_at: values.ends_at,
        ...(values.note === "" ? {} : { note: values.note }),
      }),
    onSuccess: async () => {
      form.reset(EMPTY)
      setOpen(false)
      toasts.done(
        t("admin.subscriptions.granted", { organization: organization.name })
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.organization(organization.id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.admin.allSubscriptions,
        }),
        onGranted?.(),
      ])
    },
  })
  const refused = grant.isError ? apiFailure(grant.error) : null

  if (isPlatformOrganization(organization.id)) {
    return null
  }

  const submit = form.handleSubmit((values) => {
    grant.mutate(values)
  })

  return (
    <div className="flex flex-col items-end gap-1">
      <DialogRoot
        onOpenChange={(next) => {
          setOpen(next)

          if (!next) {
            grant.reset()
          }
        }}
        open={open}
      >
        <DialogTrigger
          render={
            <Button disabled={blocked} icon={Gift} size="sm">
              {t("admin.subscriptions.grant")}
            </Button>
          }
        />
        <DialogPopup
          description={t("admin.subscriptions.grantDescription", {
            organization: organization.name,
          })}
          size="sm"
          title={t("admin.subscriptions.grantTitle")}
        >
          <form
            className="mt-gutter flex flex-col gap-gutter"
            noValidate
            onSubmit={(event) => {
              submit(event)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${prefix}-seats`}>
                {t("admin.subscriptions.seats")}
              </Label>
              <Input
                className="w-24 font-data tabular-nums"
                id={`${prefix}-seats`}
                inputMode="numeric"
                max={MAX_SEATS}
                min={MIN_SEATS}
                type="number"
                {...form.register("seats")}
              />
              <FieldError>{form.formState.errors.seats?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${prefix}-ends-at`}>
                {t("admin.subscriptions.endsAtOptional")}
              </Label>
              <Input
                className="w-44 font-data tabular-nums"
                id={`${prefix}-ends-at`}
                type="date"
                {...form.register("ends_at")}
              />
              <FieldError>{form.formState.errors.ends_at?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${prefix}-note`}>
                {t("admin.subscriptions.noteOptional")}
              </Label>
              <Textarea
                className="min-h-20"
                id={`${prefix}-note`}
                maxLength={MAX_SUBSCRIPTION_NOTE_LENGTH}
                {...form.register("note")}
              />
              <FieldError>{form.formState.errors.note?.message}</FieldError>
            </div>

            {grant.isError ? (
              <Callout
                fix={refused?.fix ?? t("common.retryLater")}
                title={refused?.message ?? t("admin.subscriptions.grantFailed")}
                tone="danger"
              />
            ) : null}

            <div className="flex justify-end gap-2">
              <DialogClose
                render={<Button variant="ghost">{t("common.cancel")}</Button>}
              />
              <Button
                icon={Gift}
                loading={grant.isPending}
                type="submit"
                variant="primary"
              >
                {grant.isPending
                  ? t("admin.subscriptions.granting")
                  : t("admin.subscriptions.grantAction")}
              </Button>
            </div>
          </form>
        </DialogPopup>
      </DialogRoot>

      {blocked ? (
        <p className="text-[12px] text-ink-3">
          {t("admin.subscriptions.grantBlocked")}
        </p>
      ) : null}
    </div>
  )
}
