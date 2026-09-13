import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { inviteMember, queryKeys } from "@/lib/api/queries"
import {
  INVITABLE_ROLES,
  roleDescriptionKey,
  roleKey,
} from "@/lib/domain/roles"
import {
  type InviteInput,
  type InviteValues,
  inviteSchema,
} from "@/lib/schemas/members"

export interface InviteFormProps {
  organizationId: string
}

export function InviteForm({ organizationId }: InviteFormProps) {
  const t = useTranslations()
  const form = useForm<InviteInput, InviteValues>({
    schema: inviteSchema(t),
    defaultValues: { email: "", role: "member" },
  })
  const invite = useOptimisticMutation<InviteValues, void>({
    mutationFn: (values) =>
      inviteMember(organizationId, {
        email: values.email,
        role: values.role as (typeof INVITABLE_ROLES)[number],
      }),
    invalidate: [queryKeys.members(organizationId)],
    onDone: () => {
      form.reset({ email: "", role: form.getValues("role") })
    },
    toast: {
      done: (_data, values) => t("invites.sent", { email: values.email }),
      failed: () => ({
        title: t("invites.failed"),
        fix: t("invites.failedFix"),
      }),
    },
  })
  const role = form.watch("role")

  const submit = form.handleSubmit((values) => {
    invite.mutate(values)
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
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <Label htmlFor="invite-email">{t("invites.email")}</Label>
          <Input
            autoComplete="off"
            className="font-data"
            id="invite-email"
            placeholder={t("invites.emailPlaceholder")}
            type="email"
            {...form.register("email")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("invites.role")}</Label>
          <SegmentedControl
            onValueChange={(next) => {
              form.setValue("role", next)
            }}
            options={INVITABLE_ROLES.map((candidate) => ({
              value: candidate,
              label: t(roleKey(candidate) ?? "role.member"),
            }))}
            value={role as (typeof INVITABLE_ROLES)[number]}
          />
        </div>

        <Button
          icon={UserPlus}
          loading={invite.isPending}
          type="submit"
          variant="primary"
        >
          {invite.isPending ? t("invites.sending") : t("invites.send")}
        </Button>
      </div>

      <p className="text-[13px] text-ink-2">
        {t(roleDescriptionKey(role) ?? "role.member.description")}
      </p>

      <FieldError>{form.formState.errors.email?.message}</FieldError>
    </form>
  )
}
