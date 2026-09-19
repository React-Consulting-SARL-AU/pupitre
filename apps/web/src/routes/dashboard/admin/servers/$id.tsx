import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ADMIN_SERVER_TAB,
  AdminServerDetail,
  type AdminServerTab,
  adminServerTab,
} from "@/components/admin/admin-server-detail"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/servers/$id"

interface AdminServerSearch {
  tab?: AdminServerTab
}

export const Route = createFileRoute("/dashboard/admin/servers/$id")({
  component: AdminServerPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: (search: Record<string, unknown>): AdminServerSearch => {
    const tab = adminServerTab(search.tab)

    return tab === ADMIN_SERVER_TAB ? {} : { tab }
  },
})

function AdminServerPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminServerDetail
        id={id}
        onTabChange={(next) => {
          navigate({ replace: true, search: { tab: next }, to: "." })
        }}
        tab={tab ?? ADMIN_SERVER_TAB}
      />
    </>
  )
}
