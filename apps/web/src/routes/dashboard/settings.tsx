import { createFileRoute } from "@tanstack/react-router"
import { AppearanceCard } from "@/components/dashboard/appearance-card"
import { DeleteAccountCard } from "@/components/dashboard/delete-account-card"
import { ProfileForm } from "@/components/dashboard/profile-form"
import { SecurityCard } from "@/components/dashboard/security-card"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/settings")({
  head: ({ match }) => ({
    meta: [
      { title: documentTitle("/dashboard/settings", match.context.locale) },
    ],
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/settings")

  return (
    <>
      <PageHeader
        description={t("page.settings.description")}
        parents={parents}
        title={t(title)}
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
