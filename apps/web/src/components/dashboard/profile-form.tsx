import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import { queryKeys } from "@/lib/api/queries"
import { authClient } from "@/lib/auth/client"
import { type ProfileInput, profileSchema } from "@/lib/schemas/profile"

async function updateName(name: string): Promise<void> {
  const { error } = await authClient().updateUser({ name })

  if (error) {
    throw new Error(error.message ?? "profile_update_failed")
  }
}

export function ProfileForm() {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const form = useForm<ProfileInput>({
    schema: profileSchema(t),
    defaultValues: { name: user.name },
  })
  const save = useOptimisticMutation<ProfileInput, void>({
    mutationFn: (values) => updateName(values.name),
    invalidate: [queryKeys.me],
    toast: {
      done: () => t("profile.saved"),
      failed: () => ({
        title: t("profile.failed"),
        fix: t("profile.failedFix"),
      }),
    },
  })

  const submit = form.handleSubmit((values) => {
    save.mutate(values)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex max-w-md flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t("profile.name")}</Label>
            <Input autoComplete="name" id="name" {...form.register("name")} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("profile.email")}</Label>
            <Input
              disabled
              id="email"
              readOnly
              type="email"
              value={user.email}
            />
            <p className="text-[12px] text-ink-3">{t("profile.emailHelp")}</p>
          </div>

          <div>
            <Button
              icon={Check}
              loading={save.isPending}
              type="submit"
              variant="primary"
            >
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
