import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { HardDrive } from "lucide-react"
import {
  type AdminServerRowServer,
  adminServerColumns,
} from "@/components/admin/admin-server-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import {
  type AdminServer,
  type AdminServerPage,
  adminServersQueryOptions,
  suspendServer,
} from "@/lib/api/admin-queries"
import { type AdminServerPageQuery, queryKeys } from "@/lib/api/queries"
import { canActOnPlatform } from "@/lib/domain/admin"
import type { ListSearchHandle } from "@/lib/domain/list-search"
import { SERVER_STATUSES, statusLook } from "@/lib/domain/server-status"

const ALL_STATUSES = ""

interface SuspendTarget {
  id: string
  name: string
  reason: string
}

export interface AdminServerListSearch {
  q?: string
  offset?: number
  status?: string
}

export type AdminServerListProps = ListSearchHandle<AdminServerListSearch>

export function AdminServerList({ search, setSearch }: AdminServerListProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const status = search.status ?? ALL_STATUSES
  const pageQuery: AdminServerPageQuery = {
    limit: ADMIN_PAGE_SIZE,
    offset,
    ...(status === ALL_STATUSES ? {} : { status }),
    ...(query === "" ? {} : { q: query }),
  }
  const page = useQuery(adminServersQueryOptions(pageQuery))

  const suspend = useOptimisticMutation<SuspendTarget, AdminServer>({
    mutationFn: ({ id, reason }) => suspendServer(id, reason),
    patch: [
      patchQuery<AdminServerPage, SuspendTarget>(
        queryKeys.admin.servers(pageQuery),
        (previous, target) => ({
          ...previous,
          data: previous.data.map((server) =>
            server.id === target.id
              ? { ...server, status: "suspended", suspended_reason: "admin" }
              : server
          ),
        })
      ),
    ],
    invalidate: [queryKeys.admin.allServers, queryKeys.admin.overview],
    toast: {
      done: (_data, target) =>
        t("admin.servers.suspended", { name: target.name }),
      failed: () => ({
        title: t("admin.servers.suspendFailed"),
        fix: t("admin.servers.suspendFailedFix"),
      }),
    },
  })

  return (
    <AsyncDataTable
      columns={adminServerColumns(t, {
        canAct: canActOnPlatform(platformRole),
        suspending: suspend.isPending ? suspend.variables?.id : undefined,
        onSuspend: (server: AdminServerRowServer, reason: string) => {
          suspend.mutate({ id: server.id, name: server.name, reason })
        },
      })}
      data={page.data?.data ?? []}
      emptyIcon={HardDrive}
      emptyTitle={t("admin.servers.empty")}
      filters={
        <div className="flex flex-col gap-2">
          <Label htmlFor="admin-servers-status">
            {t("admin.servers.status")}
          </Label>
          <Select
            className="w-[200px]"
            id="admin-servers-status"
            items={[
              { value: ALL_STATUSES, label: t("admin.servers.allStatuses") },
              ...SERVER_STATUSES.map((candidate) => ({
                value: candidate,
                label: t(statusLook(candidate).label),
              })),
            ]}
            onValueChange={(next) => {
              setSearch({ status: next })
            }}
            value={status}
          />
        </div>
      }
      isError={page.isError}
      isFetching={page.isFetching}
      isPending={page.isPending}
      limit={ADMIN_PAGE_SIZE}
      offset={offset}
      onOffsetChange={(next) => {
        setSearch({ offset: next })
      }}
      refetch={() => {
        page.refetch()
      }}
      rowKey={(server) => server.id}
      rowLabel={(server) => server.name}
      rowLink={(server) => ({
        to: "/dashboard/admin/servers/$id",
        params: { id: server.id },
      })}
      search={{
        id: "admin-servers-search",
        value: query,
        placeholder: t("admin.servers.searchPlaceholder"),
        onChange: (next) => {
          setSearch({ q: next })
        },
      }}
      title={t("admin.servers.title")}
      total={page.data?.total ?? 0}
    />
  )
}
