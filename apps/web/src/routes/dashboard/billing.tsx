import { createFileRoute, redirect } from "@tanstack/react-router"
import { BillingPanel } from "@/components/dashboard/billing-panel"
import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import { type Me, queryKeys } from "@/lib/api/queries"
import { isPlatformOrganization } from "@/lib/domain/admin"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

export const Route = createFileRoute("/dashboard/billing")({
  /** Nobody bills Pupitre for Pupitre: the platform organisation has no billing page. */
  beforeLoad: ({ context }) => {
    const me = context.queryClient.getQueryData<Me>(queryKeys.me)

    if (isPlatformOrganization(me?.active_organization?.id)) {
      throw redirect({ to: "/dashboard/admin" })
    }
  },
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
