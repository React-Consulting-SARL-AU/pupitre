import { createFileRoute } from "@tanstack/react-router"
import { AdminSubscriptionList } from "@/components/admin/admin-subscription-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/subscriptions"

export const Route = createFileRoute("/dashboard/admin/subscriptions/")({
  component: AdminSubscriptionsPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
})

function AdminSubscriptionsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminSubscriptionList />
    </>
  )
}
