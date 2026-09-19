import type { UseQueryResult } from "@tanstack/react-query"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminReleaseRow } from "@/components/admin/admin-release-row"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonRows } from "@/components/ui/skeleton"
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

  if (builds.isPending) {
    return <SkeletonRows label={t("admin.reading")} />
  }

  if (builds.isError) {
    return (
      <AdminFailure
        fetching={builds.isFetching}
        onRetry={() => {
          builds.refetch()
        }}
      />
    )
  }

  const versions = releaseVersions(builds.data)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {versions.length}
        </span>
      </CardHeader>

      {versions.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">{t("admin.releases.empty")}</p>
        </CardBody>
      ) : (
        <ul aria-busy={builds.isFetching || undefined}>
          {versions.map((version) => (
            <AdminReleaseRow
              canPromote={canPromote}
              key={version.version}
              onPromote={() => {
                onPromote(version.version)
              }}
              promoting={promoting === version.version}
              target={target}
              version={version}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
