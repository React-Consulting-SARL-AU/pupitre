import { useQuery } from "@tanstack/react-query"
import { AdminReleaseList } from "@/components/admin/admin-release-list"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  adminAppReleasesQueryOptions,
  adminReleasesQueryOptions,
  promoteAppRelease,
  promoteRelease,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import type { ListSearchHandle } from "@/lib/domain/list-search"

export interface AdminReleasesSearch {
  offset?: number
  app_offset?: number
}

export type AdminReleasesProps = ListSearchHandle<AdminReleasesSearch>

export function AdminReleases({ search, setSearch }: AdminReleasesProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const agent = useQuery(adminReleasesQueryOptions())
  const app = useQuery(adminAppReleasesQueryOptions())
  const canPromote = canActOnPlatform(platformRole)

  const promoteAgent = useOptimisticMutation<string>({
    mutationFn: promoteRelease,
    invalidate: [queryKeys.admin.releases],
    toast: {
      done: (_data, version) => t("admin.releases.promoted", { version }),
      failed: () => ({
        title: t("admin.releases.promoteFailed"),
        fix: t("common.retryLater"),
      }),
    },
  })
  const promoteApp = useOptimisticMutation<string>({
    mutationFn: promoteAppRelease,
    invalidate: [queryKeys.admin.appReleases],
    toast: {
      done: (_data, version) => t("admin.releases.promoted", { version }),
      failed: () => ({
        title: t("admin.releases.promoteFailed"),
        fix: t("common.retryLater"),
      }),
    },
  })

  return (
    <div className="flex flex-col gap-section">
      <AdminReleaseList
        builds={agent}
        canPromote={canPromote}
        offset={search.offset ?? 0}
        onOffsetChange={(offset) => {
          setSearch({ offset })
        }}
        onPromote={(version) => {
          promoteAgent.mutate(version)
        }}
        promoting={promoteAgent.isPending ? promoteAgent.variables : undefined}
        target={t("admin.releases.agentTarget")}
        title={t("admin.releases.agent")}
      />

      <AdminReleaseList
        builds={app}
        canPromote={canPromote}
        offset={search.app_offset ?? 0}
        onOffsetChange={(offset) => {
          setSearch({ app_offset: offset })
        }}
        onPromote={(version) => {
          promoteApp.mutate(version)
        }}
        promoting={promoteApp.isPending ? promoteApp.variables : undefined}
        target={t("admin.releases.appTarget")}
        title={t("admin.releases.app")}
      />
    </div>
  )
}
