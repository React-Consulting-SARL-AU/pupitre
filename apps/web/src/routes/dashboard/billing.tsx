import { createFileRoute } from "@tanstack/react-router"
import { BillingPanel } from "@/components/dashboard/billing-panel"
import { PageHeader } from "@/components/ui/page-header"
import { pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/billing")({
  component: BillingPage,
})

function BillingPage() {
  const { title, parents } = pageTitle("/dashboard/billing")

  return (
    <>
      <PageHeader
        description="Un siège par serveur. Le paiement et les factures vivent chez Stripe ; ce que vous voyez ici en est le miroir."
        parents={parents}
        title={title}
      />
      <BillingPanel />
    </>
  )
}
