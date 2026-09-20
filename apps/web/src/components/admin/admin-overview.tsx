import { useQuery } from "@tanstack/react-query"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminFigure } from "@/components/admin/admin-figure"
import { AdminWorklists } from "@/components/admin/admin-worklists"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { adminOverviewQueryOptions } from "@/lib/api/admin-queries"
import { overviewFigures } from "@/lib/domain/admin"

export function AdminOverview() {
  const t = useTranslations()
  const overview = useQuery(adminOverviewQueryOptions())

  if (overview.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (overview.isError) {
    return (
      <AdminFailure
        fetching={overview.isFetching}
        onRetry={() => {
          overview.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div className="grid grid-cols-2 gap-gutter md:grid-cols-3 xl:grid-cols-4">
        {overviewFigures(overview.data).map((figure) => (
          <AdminFigure figure={figure} key={figure.id} />
        ))}
      </div>

      <AdminWorklists worklists={overview.data.worklists} />
    </div>
  )
}
