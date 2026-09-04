import { createFileRoute } from "@tanstack/react-router"
import { AuthCard } from "@/components/auth/auth-card"
import { SignInForm } from "@/components/auth/sign-in-form"
import { documentTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/auth/sign-in")({
  component: SignInPage,
  head: () => ({ meta: [{ title: documentTitle("/auth/sign-in") }] }),
})

function SignInPage() {
  return (
    <AuthCard
      description="Un lien de connexion, ou votre compte GitHub. Aucun mot de passe à retenir."
      title="Connexion"
    >
      <SignInForm />
    </AuthCard>
  )
}
