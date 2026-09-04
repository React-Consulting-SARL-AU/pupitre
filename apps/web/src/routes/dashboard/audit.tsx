import { createFileRoute } from "@tanstack/react-router"
import { AuditLog } from "@/components/dashboard/audit-log"
import { PageHeader } from "@/components/ui/page-header"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/audit")({
  component: AuditPage,
})

function AuditPage() {
  const { title, parents } = pageTitle("/dashboard/audit")

  return (
    <>
      <PageHeader
        description="Ce que l'organisation a fait, qui l'a fait et quand. Le journal est en lecture seule et ne s'efface pas."
        parents={parents}
        title={title}
      />
      <AuditLog />
    </>
  )
}
