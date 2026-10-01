import { createFileRoute, redirect } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { DataConsentForm } from "@/components/auth/data-consent-form"
import { useTranslations } from "@/hooks/use-locale"
import { meQueryOptions } from "@/lib/api/queries"
import { safeCallbackUrl } from "@/lib/auth/callback-url"
import { requireSession } from "@/lib/auth/session-gate"
import { appOrigin } from "@/lib/config/urls"
import { documentTitle } from "@/lib/domain/page-titles"

interface ConsentSearch {
  callbackURL: string
}

export const Route = createFileRoute("/auth/consent")({
  // Reached right after a sign-in, in whatever browser holds the session, so it is read client-side.
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ConsentSearch => ({
    callbackURL: safeCallbackUrl(search.callbackURL, appOrigin()),
  }),
  beforeLoad: async ({ context, location, search }) => {
    await requireSession({ context, location })

    const me = await context.queryClient.ensureQueryData(meQueryOptions())

    if (me.data_consent !== null) {
      throw redirect({ href: search.callbackURL })
    }
  },
  component: ConsentPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/consent", match.context.locale) }],
  }),
})

function ConsentPage() {
  const { callbackURL } = Route.useSearch()
  const t = useTranslations()

  return (
    <AuthCard
      description={t("auth.consent.description")}
      title={t("auth.consent.title")}
      width="wide"
    >
      <DataConsentForm callbackURL={callbackURL} />
    </AuthCard>
  )
}
