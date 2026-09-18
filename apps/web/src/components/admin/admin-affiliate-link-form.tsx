import { ApiError } from "@pupitre/api/client"
import { AFFILIATE_MAX_FREE_MONTHS } from "@pupitre/shared/plans"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useToast } from "@/hooks/use-toast"
import { createAffiliateLink } from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import {
  type AffiliateLinkFormInput,
  type AffiliateLinkFormValues,
  affiliateLinkSchema,
  MIN_AFFILIATE_SEATS,
} from "@/lib/schemas/admin"

const CONFLICT = 409

const EMPTY: AffiliateLinkFormInput = {
  name: "",
  code: "",
  free_months: 1,
  seats: MIN_AFFILIATE_SEATS,
}

export function AdminAffiliateLinkForm() {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const toasts = useToast()
  const form = useForm<AffiliateLinkFormInput, AffiliateLinkFormValues>({
    schema: affiliateLinkSchema(t),
    defaultValues: EMPTY,
  })
  const create = useMutation({
    mutationFn: (values: AffiliateLinkFormValues) =>
      createAffiliateLink({
        name: values.name,
        free_months: values.free_months,
        seats: values.seats,
        ...(values.code === "" ? {} : { code: values.code }),
      }),
    onSuccess: async (_data, values) => {
      form.reset(EMPTY)
      toasts.done(t("admin.links.created", { name: values.name }))
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.affiliateLinks,
      })
    },
    onError: (error) => {
      const said = apiFailure(error)

      if (error instanceof ApiError && error.status === CONFLICT && said) {
        form.setError("code", { message: said.message })
      }
    },
  })
  const refused = create.isError ? apiFailure(create.error) : null

  const submit = form.handleSubmit((values) => {
    create.mutate(values)
  })

  return (
    <form
      className="flex flex-col gap-gutter"
      noValidate
      onSubmit={(event) => {
        submit(event)
      }}
    >
      <div className="flex flex-wrap items-end gap-gutter">
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <Label htmlFor="affiliate-name">{t("admin.links.name")}</Label>
          <Input
            autoComplete="off"
            id="affiliate-name"
            placeholder={t("admin.links.namePlaceholder")}
            {...form.register("name")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="affiliate-code">
            {t("admin.links.codeOptional")}
          </Label>
          <Input
            autoComplete="off"
            className="w-44 font-data"
            id="affiliate-code"
            placeholder={t("admin.links.codePlaceholder")}
            {...form.register("code")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="affiliate-free-months">
            {t("admin.links.freeMonthsField")}
          </Label>
          <Input
            className="w-24 font-data tabular-nums"
            id="affiliate-free-months"
            inputMode="numeric"
            max={AFFILIATE_MAX_FREE_MONTHS}
            min={0}
            type="number"
            {...form.register("free_months")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="affiliate-seats">{t("admin.links.seatsField")}</Label>
          <Input
            className="w-24 font-data tabular-nums"
            id="affiliate-seats"
            inputMode="numeric"
            min={MIN_AFFILIATE_SEATS}
            type="number"
            {...form.register("seats")}
          />
        </div>

        <Button
          icon={Plus}
          loading={create.isPending}
          type="submit"
          variant="primary"
        >
          {create.isPending
            ? t("admin.links.creating")
            : t("admin.links.createAction")}
        </Button>
      </div>

      <FieldError>
        {form.formState.errors.name?.message ??
          form.formState.errors.code?.message ??
          form.formState.errors.free_months?.message ??
          form.formState.errors.seats?.message}
      </FieldError>

      {create.isError && !form.formState.errors.code ? (
        <Callout
          fix={refused?.fix ?? t("admin.links.createFailedFix")}
          title={refused?.message ?? t("admin.links.createFailed")}
          tone="danger"
        />
      ) : null}
    </form>
  )
}
