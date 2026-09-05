import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { SignInForm } from "@/components/auth/sign-in-form"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/auth/sign-in")({
  component: SignInPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/auth/sign-in", match.context.locale) }],
  }),
})

function SignInPage() {
  const t = useTranslations()

  return (
    <AuthCard
      description={t("auth.signIn.description")}
      title={t("auth.signIn.title")}
    >
      <SignInForm />
    </AuthCard>
  )
}
