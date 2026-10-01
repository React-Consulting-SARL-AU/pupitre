import {
  AFFILIATE_NOTES_MAX_LENGTH,
  AFFILIATE_PARTNER_NAME_MAX_LENGTH,
} from "@pupitre/shared/plans"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AffiliateLink,
  type AffiliateLinkDetail,
  updateAffiliateLink,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  type AffiliateLinkEditInput,
  type AffiliateLinkEditValues,
  affiliateLinkEditSchema,
} from "@/lib/schemas/admin"

export interface AdminAffiliateLinkSettingsProps {
  link: AffiliateLinkDetail
}

export function AdminAffiliateLinkSettings({
  link,
}: AdminAffiliateLinkSettingsProps) {
  const t = useTranslations()
  const held: AffiliateLinkEditInput = {
    name: link.name,
    partner_name: link.partner?.name ?? "",
    partner_email: link.partner?.email ?? "",
    notes: link.notes ?? "",
  }
  const form = useForm<AffiliateLinkEditInput, AffiliateLinkEditValues>({
    schema: affiliateLinkEditSchema(t),
    values: held,
  })
  const apply = useOptimisticMutation<AffiliateLinkEditValues, AffiliateLink>({
    mutationFn: (values) => updateAffiliateLink(link.id, values),
    invalidate: [
      queryKeys.admin.affiliateLink(link.id),
      queryKeys.admin.affiliateLinks,
    ],
    toast: {
      done: (_data, values) => t("admin.links.applied", { name: values.name }),
      failed: () => ({
        title: t("admin.links.applyFailed"),
        fix: t("common.retryLater"),
      }),
    },
  })

  const submit = form.handleSubmit((values) => {
    apply.mutate(values)
  })
  const wanted = form.watch()
  const unchanged =
    wanted.name === held.name &&
    wanted.partner_name === held.partner_name &&
    wanted.partner_email === held.partner_email &&
    wanted.notes === held.notes

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.links.settings")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-name">{t("admin.links.name")}</Label>
            <Input
              autoComplete="off"
              id="link-name"
              {...form.register("name")}
            />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>

          <div className="flex flex-wrap items-start gap-gutter">
            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
              <Label htmlFor="link-partner-name">
                {t("admin.links.partnerNameField")}
              </Label>
              <Input
                autoComplete="off"
                id="link-partner-name"
                maxLength={AFFILIATE_PARTNER_NAME_MAX_LENGTH}
                {...form.register("partner_name")}
              />
              <FieldError>
                {form.formState.errors.partner_name?.message}
              </FieldError>
            </div>

            <div className="flex min-w-[200px] flex-1 flex-col gap-2">
              <Label htmlFor="link-partner-email">
                {t("admin.links.partnerEmailField")}
              </Label>
              <Input
                autoComplete="off"
                id="link-partner-email"
                type="email"
                {...form.register("partner_email")}
              />
              <FieldError>
                {form.formState.errors.partner_email?.message}
              </FieldError>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="link-notes">{t("admin.links.notesField")}</Label>
            <Textarea
              id="link-notes"
              maxLength={AFFILIATE_NOTES_MAX_LENGTH}
              {...form.register("notes")}
            />
            <FieldError>{form.formState.errors.notes?.message}</FieldError>
          </div>

          <div className="flex justify-end border-line border-t pt-gutter">
            <Button
              disabled={unchanged}
              icon={Check}
              loading={apply.isPending}
              type="submit"
              variant="primary"
            >
              {apply.isPending
                ? t("admin.links.applying")
                : t("admin.links.apply")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
