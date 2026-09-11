import { createFileRoute } from "@tanstack/react-router"
import { AuditLog } from "@/components/dashboard/audit-log"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/audit")({
  head: ({ match }) => ({
    meta: [{ title: documentTitle("/dashboard/audit", match.context.locale) }],
  }),
  component: AuditPage,
})

function AuditPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/audit")

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <AuditLog />
    </>
  )
}
