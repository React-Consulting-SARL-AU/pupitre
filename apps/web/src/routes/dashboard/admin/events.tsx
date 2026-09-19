import { createFileRoute } from "@tanstack/react-router"
import { AdminEventList } from "@/components/admin/admin-event-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/domain/audit"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/events"

export const Route = createFileRoute("/dashboard/admin/events")({
  component: AdminEventsPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: listSearch({
    filters: {
      organization_id: { kind: "string" },
      action: { kind: "enum", values: AUDIT_ACTIONS },
      target_type: { kind: "enum", values: AUDIT_TARGET_TYPES },
    },
  }),
})

function AdminEventsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminEventList {...list} />
    </>
  )
}
