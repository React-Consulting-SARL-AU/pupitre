import { createFileRoute } from "@tanstack/react-router"
import { DownloadPanel } from "@/components/download/download-panel"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { PageSkeleton } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { latestAppReleaseQueryOptions } from "@/lib/api/queries"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/download"

export const Route = createFileRoute("/dashboard/download")({
  component: DownloadPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(latestAppReleaseQueryOptions()),
  pendingComponent: DownloadPending,
})

function DownloadPending() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return <PageSkeleton parents={parents} shape="cards" title={t(title)} />
}

function DownloadPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <DownloadPanel />
    </>
  )
}
