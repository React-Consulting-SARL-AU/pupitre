import { createFileRoute } from "@tanstack/react-router"
import { AuditLog } from "@/components/dashboard/audit-log"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { AUDIT_ACTIONS } from "@/lib/domain/audit"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/audit")({
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/dashboard/audit", match.context.locale) }],
  }),
  component: AuditPage,
  validateSearch: listSearch({
    filters: { action: { kind: "enum", values: AUDIT_ACTIONS } },
  }),
})

function AuditPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/audit")
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AuditLog {...list} />
    </>
  )
}
