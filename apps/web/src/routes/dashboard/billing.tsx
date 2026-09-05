import { createFileRoute } from "@tanstack/react-router"
import { BillingPanel } from "@/components/dashboard/billing-panel"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
})

function BillingPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/billing")

  return (
    <>
      <PageHeader
        description={t("page.billing.description")}
        parents={parents}
        title={t(title)}
      />
      <BillingPanel />
    </>
  )
}
