import { ORGANIZATION_STATES } from "@pupitre/shared/platform"
import { createFileRoute } from "@tanstack/react-router"
import { AdminOrganizationList } from "@/components/admin/admin-organization-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/organizations"

export const Route = createFileRoute("/dashboard/admin/organizations/")({
  component: AdminOrganizationsPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: listSearch({
    filters: { state: { kind: "enum", values: ORGANIZATION_STATES } },
  }),
})

function AdminOrganizationsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminOrganizationList {...list} />
    </>
  )
}
