import { createFileRoute } from "@tanstack/react-router"
import { AdminOrganizationDetail } from "@/components/admin/admin-organization-detail"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/organizations/$id"

export const Route = createFileRoute("/dashboard/admin/organizations/$id")({
  component: AdminOrganizationPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminOrganizationPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminOrganizationDetail id={id} />
    </>
  )
}
