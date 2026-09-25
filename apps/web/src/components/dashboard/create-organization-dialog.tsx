import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { DialogClose, DialogPopup, DialogRoot } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { isOrganizationScoped, queryKeys } from "@/lib/api/queries"
import {
  createOrganization,
  setActiveOrganization,
} from "@/lib/auth/organization"
import { organizationSlugFor } from "@/lib/domain/organization"
import {
  type CreateOrganizationInput,
  type CreateOrganizationValues,
  createOrganizationSchema,
} from "@/lib/schemas/organization"

export interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const router = useRouter()
  const navigate = useNavigate()
  const form = useForm<CreateOrganizationInput, CreateOrganizationValues>({
    schema: createOrganizationSchema(t),
    defaultValues: { name: "" },
  })
  const create = useMutation({
    mutationFn: async (values: CreateOrganizationValues) => {
      const created = await createOrganization(
        values.name,
        organizationSlugFor(values.name)
      )

      await setActiveOrganization(created.id)
    },
    onSuccess: async () => {
      form.reset({ name: "" })
      onOpenChange(false)
      // Dropped, not staled: a staled answer of the previous organisation stays on screen.
      queryClient.removeQueries({
        predicate: (query) => isOrganizationScoped(query.queryKey),
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      await router.invalidate()
      await navigate({ to: "/dashboard/servers" })
    },
  })

  const submit = form.handleSubmit((values) => {
    create.mutate(values)
  })

  const slug = organizationSlugFor(form.watch("name") ?? "")

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPopup
        description={t("organization.createDescription")}
        size="sm"
        title={t("organization.createTitle")}
      >
        <form
          className="mt-gutter flex flex-col gap-2"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <Label htmlFor="organization-name">{t("organization.name")}</Label>
          <Input
            autoComplete="off"
            id="organization-name"
            placeholder={t("organization.namePlaceholder")}
            {...form.register("name")}
          />
          <p className="font-data text-[11px] text-ink-3">{slug}</p>

          <FieldError>{form.formState.errors.name?.message}</FieldError>

          {create.isError ? (
            <Callout
              fix={t("organization.createFailedFix")}
              title={t("organization.createFailed")}
              tone="danger"
            />
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <DialogClose
              render={<Button variant="ghost">{t("common.cancel")}</Button>}
            />
            <Button disabled={create.isPending} type="submit" variant="primary">
              {create.isPending
                ? t("organization.creating")
                : t("organization.createAction")}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </DialogRoot>
  )
}
