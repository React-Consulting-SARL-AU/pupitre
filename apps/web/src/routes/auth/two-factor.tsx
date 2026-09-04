import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { TwoFactorForm } from "@/components/auth/two-factor-form"
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
  head: () => ({ meta: [{ title: documentTitle("/auth/two-factor") }] }),
  validateSearch: (search: Record<string, unknown>): TwoFactorSearch => ({
    callbackURL: safeCallback(search.callbackURL),
  }),
})

function TwoFactorPage() {
  const { callbackURL } = Route.useSearch()

  return (
    <AuthCard
      description="Votre lien a été reconnu. Entrez le code de votre application d'authentification pour ouvrir la session."
      title="Second facteur"
    >
      <TwoFactorForm callbackURL={callbackURL} />
    </AuthCard>
  )
}
