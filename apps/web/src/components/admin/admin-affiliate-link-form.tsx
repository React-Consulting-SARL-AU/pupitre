import { ApiError } from "@pupitre/api/client"
import {
  AFFILIATE_NOTES_MAX_LENGTH,
  AFFILIATE_PARTNER_NAME_MAX_LENGTH,
} from "@pupitre/shared/plans"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
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
import { createAffiliateLink } from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import {
  type AffiliateLinkFormInput,
  type AffiliateLinkFormValues,
  affiliateLinkSchema,
} from "@/lib/schemas/admin"

const CONFLICT = 409

const EMPTY: AffiliateLinkFormInput = {
  name: "",
  code: "",
  partner_name: "",
  partner_email: "",
  notes: "",
}

export function AdminAffiliateLinkForm() {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const toasts = useToast()
  const [open, setOpen] = useState(false)
  const form = useForm<AffiliateLinkFormInput, AffiliateLinkFormValues>({
    schema: affiliateLinkSchema(t),
    defaultValues: EMPTY,
  })
  const create = useMutation({
    mutationFn: (values: AffiliateLinkFormValues) =>
      createAffiliateLink({
        name: values.name,
        partner_name: values.partner_name,
        partner_email: values.partner_email,
        notes: values.notes,
        ...(values.code === "" ? {} : { code: values.code }),
      }),
    onSuccess: async (_data, values) => {
      form.reset(EMPTY)
      setOpen(false)
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
    <DialogRoot
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          form.reset(EMPTY)
          create.reset()
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button icon={Plus} variant="primary">
            {t("admin.links.createOpen")}
          </Button>
        }
      />

      <DialogPopup title={t("admin.links.create")}>
        <form
          className="mt-gutter flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="affiliate-name">{t("admin.links.name")}</Label>
            <Input
              autoComplete="off"
              id="affiliate-name"
              placeholder={t("admin.links.namePlaceholder")}
              {...form.register("name")}
            />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
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
            <FieldError>{form.formState.errors.code?.message}</FieldError>
          </div>

          <div className="flex flex-wrap items-start gap-gutter">
            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
              <Label htmlFor="affiliate-partner-name">
                {t("admin.links.partnerNameField")}
              </Label>
              <Input
                autoComplete="off"
                id="affiliate-partner-name"
                maxLength={AFFILIATE_PARTNER_NAME_MAX_LENGTH}
                {...form.register("partner_name")}
              />
              <FieldError>
                {form.formState.errors.partner_name?.message}
              </FieldError>
            </div>

            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
              <Label htmlFor="affiliate-partner-email">
                {t("admin.links.partnerEmailField")}
              </Label>
              <Input
                autoComplete="off"
                id="affiliate-partner-email"
                type="email"
                {...form.register("partner_email")}
              />
              <FieldError>
                {form.formState.errors.partner_email?.message}
              </FieldError>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="affiliate-notes">
              {t("admin.links.notesField")}
            </Label>
            <Textarea
              id="affiliate-notes"
              maxLength={AFFILIATE_NOTES_MAX_LENGTH}
              {...form.register("notes")}
            />
            <FieldError>{form.formState.errors.notes?.message}</FieldError>
          </div>

          {create.isError && !form.formState.errors.code ? (
            <Callout
              fix={refused?.fix ?? t("admin.links.createFailedFix")}
              title={refused?.message ?? t("admin.links.createFailed")}
              tone="danger"
            />
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose
              render={<Button variant="ghost">{t("common.cancel")}</Button>}
            />
            <Button loading={create.isPending} type="submit" variant="primary">
              {create.isPending
                ? t("admin.links.creating")
                : t("admin.links.createAction")}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </DialogRoot>
  )
}
