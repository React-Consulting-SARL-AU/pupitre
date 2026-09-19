import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import {
  type AdminOrganizationDetail,
  renameOrganization,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  MAX_ORGANIZATION_NAME_LENGTH,
  type RenameOrganizationInput,
  type RenameOrganizationValues,
  renameOrganizationSchema,
} from "@/lib/schemas/admin"

export interface AdminOrganizationSettingsProps {
  detail: AdminOrganizationDetail
  acts: boolean
  /** Why the form is dead for this reader, written on the button. */
  refusedTitle: string | undefined
}

export function AdminOrganizationSettings({
  detail,
  acts,
  refusedTitle,
}: AdminOrganizationSettingsProps) {
  const t = useTranslations()
  const held = { name: detail.name, slug: detail.slug }
  const form = useForm<RenameOrganizationInput, RenameOrganizationValues>({
    schema: renameOrganizationSchema(t),
    values: held,
  })
  const rename = useConfirmMutation<RenameOrganizationValues>({
    mutationFn: (values) => renameOrganization(detail.id, values),
    invalidate: [
      queryKeys.admin.organization(detail.id),
      queryKeys.admin.allOrganizations,
    ],
    done: (values) =>
      t("admin.organizations.renameDone", { name: values.name }),
    failed: {
      title: t("admin.organizations.renameFailed"),
      fix: t("admin.organizations.renameFailedFix"),
    },
  })
  const submit = form.handleSubmit((values) => {
    rename.run(values)
  })
  const wanted = form.watch()
  const unchanged = wanted.name === held.name && wanted.slug === held.slug

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.organizations.rename")}</CardTitle>
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
              <Label htmlFor="organization-name">
                {t("admin.organizations.nameField")}
              </Label>
              <Input
                className="w-64"
                disabled={!acts}
                id="organization-name"
                maxLength={MAX_ORGANIZATION_NAME_LENGTH}
                {...form.register("name")}
              />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="organization-slug">
                {t("admin.organizations.slugField")}
              </Label>
              <Input
                className="w-64 font-data"
                disabled={!acts}
                id="organization-slug"
                maxLength={MAX_ORGANIZATION_NAME_LENGTH}
                {...form.register("slug")}
              />
              <FieldError>{form.formState.errors.slug?.message}</FieldError>
            </div>
          </div>

          {rename.refusal ? (
            <Callout
              fix={rename.refusal.fix}
              title={rename.refusal.message}
              tone="danger"
            />
          ) : null}

          <div className="flex justify-end border-line border-t pt-gutter">
            <Button
              disabled={unchanged || !acts}
              icon={Check}
              loading={rename.busy}
              title={refusedTitle}
              type="submit"
              variant="primary"
            >
              {rename.busy
                ? t("admin.organizations.renaming")
                : t("admin.organizations.renameApply")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
