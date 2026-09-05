import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { TwoFactorForm } from "@/components/auth/two-factor-form"
import { useTranslations } from "@/hooks/use-locale"
import { appOrigin } from "@/lib/config/urls"
import { documentTitle } from "@/lib/domain/page-titles"

const DEFAULT_CALLBACK = "/dashboard/servers"

interface TwoFactorSearch {
  callbackURL: string
}

/**
 * The challenge carries the destination the sign-in was heading to. It comes
 * back through the URL, so anything pointing off this origin is dropped: an
 * open redirect behind a sign-in is a phishing tool.
 */
function safeCallback(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    return DEFAULT_CALLBACK
  }

  try {
    const target = new URL(value, appOrigin())

    return target.origin === appOrigin()
      ? `${target.pathname}${target.search}`
      : DEFAULT_CALLBACK
  } catch {
    return DEFAULT_CALLBACK
  }
}

export const Route = createFileRoute("/auth/two-factor")({
  component: TwoFactorPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/two-factor", match.context.locale) }],
  }),
  validateSearch: (search: Record<string, unknown>): TwoFactorSearch => ({
    callbackURL: safeCallback(search.callbackURL),
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
