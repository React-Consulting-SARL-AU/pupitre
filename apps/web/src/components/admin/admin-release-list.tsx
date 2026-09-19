import type { UseQueryResult } from "@tanstack/react-query"
import { Package } from "lucide-react"
import { adminReleaseColumns } from "@/components/admin/admin-release-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { useTranslations } from "@/hooks/use-locale"
import { type ReleaseBuild, releaseVersions } from "@/lib/domain/admin"

export interface AdminReleaseListProps {
  title: string
  /** What the promotion makes this version the target of: the agents, or the download page. */
  target: string
  builds: UseQueryResult<ReleaseBuild[]>
  canPromote: boolean
  promoting: string | undefined
  onPromote: (version: string) => void
}

const PAGE_SIZE = 25

/** The agent's versions and the app's read the same way: one line per version, the artefacts counted. */
export function AdminReleaseList({
  title,
  target,
  builds,
  canPromote,
  promoting,
  onPromote,
}: AdminReleaseListProps) {
  const t = useTranslations()
  const versions = releaseVersions(builds.data ?? [])

  return (
    <AsyncDataTable
      columns={adminReleaseColumns(t, {
        canPromote,
        target,
        promoting,
        onPromote,
      })}
      data={versions.slice(0, PAGE_SIZE)}
      emptyIcon={Package}
      emptyTitle={t("admin.releases.empty")}
      isError={builds.isError}
      isFetching={builds.isFetching}
      isPending={builds.isPending}
      limit={PAGE_SIZE}
      offset={0}
      onOffsetChange={() => undefined}
      refetch={() => {
        builds.refetch()
      }}
      rowKey={(version) => version.version}
      title={title}
      total={versions.length}
    />
  )
}
