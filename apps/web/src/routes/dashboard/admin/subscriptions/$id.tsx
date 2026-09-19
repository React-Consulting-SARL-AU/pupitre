import { createFileRoute } from "@tanstack/react-router"
import { AdminSubscriptionDetail } from "@/components/admin/admin-subscription-detail"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/subscriptions/$id"

export const Route = createFileRoute("/dashboard/admin/subscriptions/$id")({
  component: AdminSubscriptionPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminSubscriptionPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminSubscriptionDetail id={id} />
    </>
  )
}
