import { createFileRoute } from "@tanstack/react-router"
import { AdminAffiliateLinkDetail } from "@/components/admin/admin-affiliate-link-detail"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/affiliate-links/$id"

export const Route = createFileRoute("/dashboard/admin/affiliate-links/$id")({
  component: AdminAffiliateLinkPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminAffiliateLinkPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminAffiliateLinkDetail id={id} />
    </>
  )
}
