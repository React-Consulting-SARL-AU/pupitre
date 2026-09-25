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

const SETTINGS_PATH = "/dashboard/settings"

/** What the save actually did, so the confirmation names the right thing. */
interface Saved {
  addressAsked: boolean
}

async function saveProfile(
  values: ProfileInput,
  currentEmail: string
): Promise<Saved> {
  const { error } = await authClient().updateUser({ name: values.name })

  if (error) {
    throw new Error(error.message ?? "profile_update_failed")
  }

  if (values.email === currentEmail) {
    return { addressAsked: false }
  }

  const change = await authClient().changeEmail({
    newEmail: values.email,
    callbackURL: SETTINGS_PATH,
  })

  if (change.error) {
    throw new Error(change.error.message ?? "profile_email_failed")
  }

  return { addressAsked: true }
}

export function ProfileForm() {
  const t = useTranslations()
  const { user } = useDashboardContext()
  const form = useForm<ProfileInput>({
    schema: profileSchema(t),
    defaultValues: { name: user.name, email: user.email },
  })
  const save = useOptimisticMutation<ProfileInput, Saved>({
    mutationFn: (values) => saveProfile(values, user.email),
    invalidate: [queryKeys.me],
    toast: {
      done: (saved) =>
        saved.addressAsked ? t("profile.emailAsked") : t("profile.saved"),
      failed: () => ({
        title: t("profile.failed"),
        fix: t("common.retryLater"),
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
              autoComplete="email"
              id="email"
              type="email"
              {...form.register("email")}
            />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
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
