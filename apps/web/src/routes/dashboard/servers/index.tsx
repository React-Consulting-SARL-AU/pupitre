import { createFileRoute } from "@tanstack/react-router"
import { ServerList } from "@/components/dashboard/server-list"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { PageSkeleton } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { serversQueryOptions } from "@/lib/api/queries"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/servers"

export const Route = createFileRoute("/dashboard/servers/")({
  component: ServersPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(serversQueryOptions()),
  pendingComponent: ServersPending,
})

function ServersPending() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return <PageSkeleton parents={parents} shape="rows" title={t(title)} />
}

function ServersPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <ServerList />
    </>
  )
}
