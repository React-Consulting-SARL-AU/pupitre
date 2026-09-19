import { createFileRoute } from "@tanstack/react-router"
import {
  ADMIN_USER_TABS,
  AdminUserDetail,
} from "@/components/admin/admin-user-detail"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"
import { tabSearch, useTabSearch } from "@/lib/domain/tab-search"

const ROUTE_ID = "/dashboard/admin/users/$id"

export const Route = createFileRoute("/dashboard/admin/users/$id")({
  component: AdminUserPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: tabSearch(ADMIN_USER_TABS),
})

function AdminUserPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const { title, parents } = pageTitle(ROUTE_ID)
  const tabs = useTabSearch(Route, ADMIN_USER_TABS)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminUserDetail id={id} {...tabs} />
    </>
  )
}
