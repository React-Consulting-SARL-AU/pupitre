import { useQuery } from "@tanstack/react-query"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminFigure } from "@/components/admin/admin-figure"
import { AdminWorklists } from "@/components/admin/admin-worklists"
import { Card } from "@/components/ui/card"
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
      <Card className="overflow-x-auto">
        <div className="flex min-w-max">
          {overviewFigures(overview.data).map((figure) => (
            <AdminFigure figure={figure} key={figure.id} />
          ))}
        </div>
      </Card>

      <AdminWorklists worklists={overview.data.worklists} />
    </div>
  )
}
