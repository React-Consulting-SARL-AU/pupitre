import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { TwoFactorForm } from "@/components/auth/two-factor-form"
import { useTranslations } from "@/hooks/use-locale"
import { safeCallbackUrl } from "@/lib/auth/callback-url"
import { appOrigin } from "@/lib/config/urls"
import { documentTitle } from "@/lib/domain/page-titles"

interface TwoFactorSearch {
  callbackURL: string
}

export const Route = createFileRoute("/auth/two-factor")({
  component: TwoFactorPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/two-factor", match.context.locale) }],
  }),
  validateSearch: (search: Record<string, unknown>): TwoFactorSearch => ({
    callbackURL: safeCallbackUrl(search.callbackURL, appOrigin()),
  }),
})

function TwoFactorPage() {
  const { callbackURL } = Route.useSearch()
  const t = useTranslations()

  return (
    <AuthCard
      description={t("auth.twoFactor.description")}
      title={t("auth.twoFactor.title")}
    >
      <TwoFactorForm callbackURL={callbackURL} />
    </AuthCard>
  )
}
