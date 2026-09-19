import { createFileRoute } from "@tanstack/react-router"
import { AdminOverview } from "@/components/admin/admin-overview"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin"

export const Route = createFileRoute("/dashboard/admin/")({
  component: AdminOverviewPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminOverviewPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminOverview />
    </>
  )
}
