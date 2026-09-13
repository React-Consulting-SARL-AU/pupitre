import { useQuery } from "@tanstack/react-query"
import { Fingerprint, Mail } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { socialProvidersQueryOptions } from "@/lib/api/queries"
import { DEFAULT_CALLBACK_URL } from "@/lib/auth/callback-url"
import { authClient } from "@/lib/auth/client"
import { leaveFor } from "@/lib/config/urls"
import { type SignInInput, signInSchema } from "@/lib/schemas/auth"
import { GithubMark } from "./github-mark"
import { GoogleMark } from "./google-mark"

export interface SignInFormProps {
  callbackURL?: string
}

export function SignInForm({
  callbackURL = DEFAULT_CALLBACK_URL,
}: SignInFormProps) {
  const t = useTranslations()
  const form = useForm<SignInInput>({
    schema: signInSchema(t),
    defaultValues: { email: "" },
  })
  const magicLink = useRequestCycle()
  const passkey = useRequestCycle()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const socialProviders = useQuery(socialProvidersQueryOptions())
  const mounted = socialProviders.data ?? []

  function signInWithPasskey() {
    return passkey.run(async () => {
      const result = await authClient().signIn.passkey()

      if (result?.error) {
        throw new Error(t("auth.signIn.passkeyFailed"))
      }

      leaveFor(callbackURL)
    })
  }

  function signInWithSocial(provider: "github" | "google") {
    authClient().signIn.social({ provider, callbackURL })
  }

  const submit = form.handleSubmit((values) =>
    magicLink.run(async () => {
      const { error } = await authClient().signIn.magicLink({
        email: values.email,
        callbackURL,
      })

      if (error) {
        throw new Error(t("auth.signIn.magicLinkFailed"))
      }

      setSentTo(values.email)
    })
  )

  if (sentTo) {
    return (
      <Callout
        fix={t("auth.signIn.sentFix")}
        title={t("auth.signIn.sent", { email: sentTo })}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          submit(event)
        }}
      >
        <Label htmlFor="email">{t("auth.signIn.email")}</Label>
        <Input
          autoComplete="email"
          id="email"
          placeholder={t("auth.signIn.emailPlaceholder")}
          type="email"
          {...form.register("email")}
        />
        <FieldError>{form.formState.errors.email?.message}</FieldError>
        <Button
          className="mt-2"
          disabled={magicLink.phase === "pending"}
          type="submit"
          variant="primary"
        >
          <Mail className="size-4" strokeWidth={1.5} />
          {magicLink.phase === "pending"
            ? t("auth.signIn.magicLinkPending")
            : t("auth.signIn.magicLink")}
        </Button>
        {magicLink.error ? (
          <Callout title={magicLink.error} tone="danger" />
        ) : null}
      </form>

      {mounted.length > 0 ? (
        <div className="flex items-center gap-3" data-testid="sign-in-divider">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            {t("common.or")}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      <Button
        disabled={passkey.phase === "pending"}
        onClick={() => {
          signInWithPasskey()
        }}
      >
        <Fingerprint className="size-4" strokeWidth={1.5} />
        {passkey.phase === "pending"
          ? t("auth.signIn.passkeyPending")
          : t("auth.signIn.passkey")}
      </Button>

      {mounted.includes("google") ? (
        <Button
          onClick={() => {
            signInWithSocial("google")
          }}
        >
          <GoogleMark className="size-4" />
          {t("auth.signIn.google")}
        </Button>
      ) : null}

      {mounted.includes("github") ? (
        <Button
          onClick={() => {
            signInWithSocial("github")
          }}
        >
          <GithubMark className="size-4" />
          {t("auth.signIn.github")}
        </Button>
      ) : null}

      {passkey.error ? <Callout title={passkey.error} tone="danger" /> : null}
    </div>
  )
}
