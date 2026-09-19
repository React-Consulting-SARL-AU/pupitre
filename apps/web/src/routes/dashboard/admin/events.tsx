import { createFileRoute } from "@tanstack/react-router"
import { AdminEventList } from "@/components/admin/admin-event-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/events"

export interface AdminEventsSearch {
  organization_id?: string
}

export const Route = createFileRoute("/dashboard/admin/events")({
  component: AdminEventsPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: (search: Record<string, unknown>): AdminEventsSearch =>
    typeof search.organization_id === "string"
      ? { organization_id: search.organization_id }
      : {},
})

function AdminEventsPage() {
  const t = useTranslations()
  const { organization_id } = Route.useSearch()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminEventList organizationId={organization_id} />
    </>
  )
}
