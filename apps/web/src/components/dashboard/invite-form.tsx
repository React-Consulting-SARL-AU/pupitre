import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { cn } from "@/lib/utils/cn"

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
          <div className="flex h-9 items-center gap-1 rounded-sm border border-line-strong bg-sunken p-1">
            {INVITABLE_ROLES.map((candidate) => (
              <button
                aria-pressed={role === candidate}
                className={cn(
                  "h-7 rounded-sm px-3 text-[13px] transition-fast",
                  "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
                  role === candidate
                    ? "bg-inverse text-inverse-ink"
                    : "text-ink-2 hover:bg-raised hover:text-ink"
                )}
                key={candidate}
                onClick={() => {
                  form.setValue("role", candidate)
                }}
                type="button"
              >
                {t(roleKey(candidate) ?? "role.member")}
              </button>
            ))}
          </div>
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
