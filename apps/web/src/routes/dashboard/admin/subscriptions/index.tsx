import { createFileRoute } from "@tanstack/react-router"
import {
  AdminSubscriptionList,
  SUBSCRIPTION_SORT,
  SUBSCRIPTION_SORTS,
} from "@/components/admin/admin-subscription-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import {
  SUBSCRIPTION_PRODUCT_FILTERS,
  SUBSCRIPTION_STATUS_FILTERS,
} from "@/lib/domain/admin"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/subscriptions"

export const Route = createFileRoute("/dashboard/admin/subscriptions/")({
  component: AdminSubscriptionsPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: listSearch({
    sortKeys: SUBSCRIPTION_SORTS,
    defaultSort: SUBSCRIPTION_SORT,
    filters: {
      status: { kind: "enum", values: SUBSCRIPTION_STATUS_FILTERS },
      product: { kind: "enum", values: SUBSCRIPTION_PRODUCT_FILTERS },
      organization_id: { kind: "string" },
      live: { kind: "boolean" },
    },
  }),
})

function AdminSubscriptionsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminSubscriptionList {...list} />
    </>
  )
}
