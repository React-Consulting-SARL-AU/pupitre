import { createFileRoute } from "@tanstack/react-router"
import { OrganizationCard } from "@/components/dashboard/organization-card"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/organization")({
  head: ({ match }) => ({
    meta: [
      { title: documentTitle("/dashboard/organization", match.context.locale) },
    ],
  }),
  component: OrganizationPage,
})

function OrganizationPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/organization")

  return (
    <>
      <PageHeader
        description={t("page.organization.description")}
        parents={parents}
        title={t(title)}
      />
      <OrganizationCard />
    </>
  )
}
