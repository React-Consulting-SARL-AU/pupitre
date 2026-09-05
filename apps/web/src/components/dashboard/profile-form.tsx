import { useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { type ProfileInput, profileSchema } from "@/lib/schemas/profile"

export function ProfileForm() {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const queryClient = useQueryClient()
  const form = useForm<ProfileInput>({
    schema: profileSchema(t),
    defaultValues: { name: user.name },
  })
  const save = useRequestCycle()

  const submit = form.handleSubmit((values) =>
    save.run(async () => {
      const { error } = await authClient().updateUser({ name: values.name })

      if (error) {
        throw new Error(t("profile.failed"))
      }

      await queryClient.invalidateQueries()
    })
  )

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

          <div className="flex items-center gap-3">
            <Button
              disabled={save.phase === "pending"}
              type="submit"
              variant="primary"
            >
              <Check className="size-4" strokeWidth={1.5} />
              {save.phase === "pending" ? t("common.saving") : t("common.save")}
            </Button>
            {save.phase === "done" ? (
              <span className="text-[13px] text-ink-2">
                {t("profile.saved")}
              </span>
            ) : null}
          </div>

          {save.error ? (
            <Callout
              fix={t("profile.failedFix")}
              title={save.error}
              tone="danger"
            />
          ) : null}
        </form>
      </CardBody>
    </Card>
  )
}
