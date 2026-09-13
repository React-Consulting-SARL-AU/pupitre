import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { SignInForm } from "@/components/auth/sign-in-form"
import { useTranslations } from "@/hooks/use-locale"
import { safeCallbackUrl } from "@/lib/auth/callback-url"
import { appOrigin } from "@/lib/config/urls"
import { documentTitle } from "@/lib/domain/page-titles"

interface SignInSearch {
  callbackURL?: string
}

export const Route = createFileRoute("/auth/sign-in")({
  component: SignInPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/sign-in", match.context.locale) }],
  }),
  validateSearch: (search: Record<string, unknown>): SignInSearch =>
    typeof search.callbackURL === "string"
      ? { callbackURL: safeCallbackUrl(search.callbackURL, appOrigin()) }
      : {},
})

function SignInPage() {
  const { callbackURL } = Route.useSearch()
  const t = useTranslations()

  return (
    <AuthCard
      description={t("auth.signIn.description")}
      title={t("auth.signIn.title")}
    >
      <SignInForm callbackURL={callbackURL} />
    </AuthCard>
  )
}
