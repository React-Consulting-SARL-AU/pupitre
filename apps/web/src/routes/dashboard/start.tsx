import { createFileRoute } from "@tanstack/react-router"
import { StartPanel } from "@/components/dashboard/start-panel"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { pageTitle } from "@/lib/domain/page-titles"

interface StartSearch {
  checkout?: "done" | "cancelled"
}

function checkoutOf(value: unknown): StartSearch["checkout"] {
  return value === "done" || value === "cancelled" ? value : undefined
}

export const Route = createFileRoute("/dashboard/start")({
  component: StartPage,
  validateSearch: (search: Record<string, unknown>): StartSearch => ({
    checkout: checkoutOf(search.checkout),
  }),
})

function StartPage() {
  const t = useTranslations()
  const { checkout } = Route.useSearch()
  const { title, parents } = pageTitle("/dashboard/start")

  return (
    <>
      <PageHeader
        description={t("page.start.description")}
        parents={parents}
        title={t(title)}
      />
      <StartPanel returningFromCheckout={checkout === "done"} />
    </>
  )
}
