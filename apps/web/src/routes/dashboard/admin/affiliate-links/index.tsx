import { createFileRoute } from "@tanstack/react-router"
import { AdminAffiliateLinkList } from "@/components/admin/admin-affiliate-link-list"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/admin/affiliate-links"

export const Route = createFileRoute("/dashboard/admin/affiliate-links/")({
  component: AdminAffiliateLinksPage,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  validateSearch: listSearch({ filters: { disabled: { kind: "boolean" } } }),
})

function AdminAffiliateLinksPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AdminAffiliateLinkList {...list} />
    </>
  )
}
