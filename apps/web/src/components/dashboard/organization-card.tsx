import { Lock, Save } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { type Me, queryKeys } from "@/lib/api/queries"
import { updateOrganization } from "@/lib/auth/organization"
import { canManageOrganization } from "@/lib/domain/organization"
import {
  type OrganizationInput,
  type OrganizationValues,
  organizationSchema,
} from "@/lib/schemas/organization"

export function OrganizationCard() {
  const t = useTranslations()
  const { activeOrganization, role } = useDashboardContext()
  const organizationId = activeOrganization?.id ?? ""
  const form = useForm<OrganizationInput, OrganizationValues>({
    schema: organizationSchema(t),
    defaultValues: {
      name: activeOrganization?.name ?? "",
      slug: activeOrganization?.slug ?? "",
    },
  })
  const save = useOptimisticMutation<OrganizationValues, void>({
    mutationFn: (values) => updateOrganization(organizationId, values),
    patch: [
      patchQuery<Me, OrganizationValues>(queryKeys.me, (me, values) => ({
        ...me,
        active_organization: me.active_organization
          ? { ...me.active_organization, ...values }
          : me.active_organization,
        organizations: me.organizations.map((organization) =>
          organization.id === organizationId
            ? { ...organization, ...values }
            : organization
        ),
      })),
    ],
    invalidate: [queryKeys.me],
    toast: {
      done: () => t("organization.saved"),
      failed: () => ({
        title: t("organization.failed"),
        fix: t("organization.failedFix"),
      }),
    },
  })
  const { reset } = form

  useEffect(() => {
    reset({
      name: activeOrganization?.name ?? "",
      slug: activeOrganization?.slug ?? "",
    })
  }, [activeOrganization?.name, activeOrganization?.slug, reset])

  const submit = form.handleSubmit((values) => {
    save.mutate(values)
  })

  if (!activeOrganization) {
    return (
      <EmptyState
        description={t("organization.noneDescription")}
        icon={Lock}
        title={t("organization.noneTitle")}
      />
    )
  }

  if (!canManageOrganization(role)) {
    return (
      <EmptyState
        description={t("organization.lockedDescription")}
        icon={Lock}
        title={t("organization.lockedTitle")}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("organization.identity")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-wrap gap-gutter">
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <Label htmlFor="organization-name">
                {t("organization.name")}
              </Label>
              <Input
                autoComplete="off"
                id="organization-name"
                {...form.register("name")}
              />
              <FieldError>{form.formState.errors.name?.message}</FieldError>
            </div>

            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <Label htmlFor="organization-slug">
                {t("organization.slug")}
              </Label>
              <Input
                autoComplete="off"
                className="font-data"
                id="organization-slug"
                {...form.register("slug")}
              />
              <FieldError>{form.formState.errors.slug?.message}</FieldError>
            </div>
          </div>

          <p className="text-[13px] text-ink-2">{t("organization.slugHelp")}</p>

          <div>
            <Button
              icon={Save}
              loading={save.isPending}
              type="submit"
              variant="primary"
            >
              {save.isPending
                ? t("organization.saving")
                : t("organization.save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
