import { createFileRoute } from "@tanstack/react-router"
import { AdminServerList } from "@/components/admin/admin-server-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"
import { SERVER_STATUSES } from "@/lib/domain/server-status"

const ROUTE_ID = "/dashboard/admin/servers"

export const Route = createFileRoute("/dashboard/admin/servers/")({
  component: AdminServersPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: listSearch({
    filters: { status: { kind: "enum", values: SERVER_STATUSES } },
  }),
})

function AdminServersPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminServerList {...list} />
    </>
  )
}
