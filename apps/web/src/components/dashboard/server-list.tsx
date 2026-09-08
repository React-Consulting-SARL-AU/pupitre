import { useQuery } from "@tanstack/react-query"
import { AlertBanner } from "@/components/dashboard/alert-banner"
import { ServerRow } from "@/components/dashboard/server-row"
import { StartChecklist } from "@/components/dashboard/start-checklist"
import { Callout } from "@/components/ui/callout"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { usePermission } from "@/hooks/use-permission"
import {
  deleteServer,
  queryKeys,
  type ServerSummary,
  serversQueryOptions,
} from "@/lib/api/queries"
import { countAlerts } from "@/lib/domain/alerts"
import { purgeable } from "@/lib/domain/server-deletion"

interface PurgeTarget {
  id: string
  name: string
}

export function ServerList() {
  const t = useTranslations()
  const servers = useQuery(serversQueryOptions())
  const canManage = usePermission("servers:manage")

  const purge = useOptimisticMutation<PurgeTarget, void>({
    mutationFn: ({ id }) => deleteServer(id),
    patch: [
      patchQuery<ServerSummary[], PurgeTarget>(
        queryKeys.servers,
        (list, target) => list.filter((server) => server.id !== target.id)
      ),
    ],
    invalidate: [queryKeys.servers],
    toast: {
      done: (_data, target) => t("serverActions.purged", { name: target.name }),
      failed: () => ({
        title: t("serverActions.deleteFailed"),
        fix: t("serverActions.deleteFailedFix"),
      }),
    },
  })
  const purging = purge.isPending ? purge.variables?.id : undefined

  if (servers.isPending) {
    return <SkeletonRows />
  }

  if (servers.isError) {
    return (
      <Callout
        fix={t("serverList.failedFix")}
        title={t("serverList.failed")}
        tone="danger"
      />
    )
  }

  if (servers.data.length === 0) {
    return <StartChecklist />
  }

  return (
    <>
      <AlertBanner count={countAlerts(servers.data)} />

      <div
        className="overflow-hidden rounded-md bg-surface shadow-raised"
        data-testid="server-list"
      >
        {servers.data.map((server, index) => (
          <ServerRow
            index={index}
            key={server.id}
            onPurge={() => {
              purge.mutate({ id: server.id, name: server.name })
            }}
            purgeable={canManage && purgeable(server.status)}
            purging={purging === server.id}
            server={server}
          />
        ))}
      </div>
    </>
  )
}
