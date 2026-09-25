import { createFileRoute } from "@tanstack/react-router"
import { BackupList } from "@/components/dashboard/backup-list"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError } from "@/components/ui/route-error"
import { PageSkeleton } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { backupsQueryOptions } from "@/lib/api/queries"
import { listSearch, useListSearch } from "@/lib/domain/list-search"
import { documentTitle, pageTitle } from "@/lib/domain/page-titles"

const ROUTE_ID = "/dashboard/backups"

export const Route = createFileRoute("/dashboard/backups")({
  component: BackupsPage,
  errorComponent: RouteError,
  head: ({ match }) => ({
    meta: [{ title: documentTitle(ROUTE_ID, match.context.locale) }],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(backupsQueryOptions()),
  pendingComponent: BackupsPending,
  validateSearch: listSearch(),
})

function BackupsPending() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return <PageSkeleton parents={parents} shape="rows" title={t(title)} />
}

function BackupsPage() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)
  const list = useListSearch(Route)

  return (
    <>
      <PageHeader parents={parents} title={t(title)} />
      <BackupList {...list} />
    </>
  )
}
