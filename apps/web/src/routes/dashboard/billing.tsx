import { createFileRoute } from "@tanstack/react-router"
import { BillingPanel } from "@/components/dashboard/billing-panel"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/billing")({
  head: ({ match }) => ({
    meta: [
      { title: documentTitle("/dashboard/billing", match.context.locale) },
    ],
  }),
  component: BillingPage,
})

function BillingPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle("/dashboard/billing")

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <BillingPanel />
    </>
  )
}
