import { createFileRoute } from "@tanstack/react-router"
import { AdminReleases } from "@/components/admin/admin-releases"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/releases"

export const Route = createFileRoute("/dashboard/admin/releases")({
  component: AdminReleasesPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminReleasesPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminReleases />
    </>
  )
}
