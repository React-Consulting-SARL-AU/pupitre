import { createFileRoute } from "@tanstack/react-router"
import { AdminOrganizationList } from "@/components/admin/admin-organization-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/organizations"

export const Route = createFileRoute("/dashboard/admin/organizations/")({
  component: AdminOrganizationsPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminOrganizationsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminOrganizationList />
    </>
  )
}
