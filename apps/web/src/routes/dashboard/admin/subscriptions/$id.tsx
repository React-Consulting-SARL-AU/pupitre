import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ADMIN_SUBSCRIPTION_TAB,
  AdminSubscriptionDetail,
  type AdminSubscriptionTab,
  adminSubscriptionTab,
} from "@/components/admin/admin-subscription-detail"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/subscriptions/$id"

interface AdminSubscriptionSearch {
  tab?: AdminSubscriptionTab
}

export const Route = createFileRoute("/dashboard/admin/subscriptions/$id")({
  component: AdminSubscriptionPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: (
    search: Record<string, unknown>
  ): AdminSubscriptionSearch => {
    const tab = adminSubscriptionTab(search.tab)

    return tab === ADMIN_SUBSCRIPTION_TAB ? {} : { tab }
  },
})

function AdminSubscriptionPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminSubscriptionDetail
        id={id}
        onTabChange={(next) => {
          navigate({ replace: true, search: { tab: next }, to: "." })
        }}
        tab={tab ?? ADMIN_SUBSCRIPTION_TAB}
      />
    </>
  )
}
