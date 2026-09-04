import { createFileRoute } from "@tanstack/react-router"
import { AppearanceCard } from "@/components/dashboard/appearance-card"
import { DeleteAccountCard } from "@/components/dashboard/delete-account-card"
import { ProfileForm } from "@/components/dashboard/profile-form"
import { SecurityCard } from "@/components/dashboard/security-card"
import { PageHeader } from "@/components/ui/page-header"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  const { title, parents } = pageTitle("/dashboard/settings")

  return (
    <>
      <PageHeader
        description="Votre compte, son apparence et sa sécurité. Ce qui touche à l'organisation vit ailleurs."
        parents={parents}
        title={title}
      />
      <div className="flex flex-col gap-section">
        <ProfileForm />
        <AppearanceCard />
        <SecurityCard />
        <DeleteAccountCard />
      </div>
    </>
  )
}
