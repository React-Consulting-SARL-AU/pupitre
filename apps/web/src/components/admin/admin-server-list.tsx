import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { HardDrive } from "lucide-react"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminSearchForm } from "@/components/admin/admin-search-form"
import { AdminServerRow } from "@/components/admin/admin-server-row"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select } from "@/components/ui/select"
import { SkeletonRows } from "@/components/ui/skeleton"
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
import { SERVER_STATUSES, statusLook } from "@/lib/domain/server-status"

const ALL_STATUSES = ""

interface SuspendTarget {
  id: string
  name: string
  reason: string
}

export function AdminServerList() {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const [status, setStatus] = useState(ALL_STATUSES)
  const [query, setQuery] = useState("")
  const [offset, setOffset] = useState(0)
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
  const suspending = suspend.isPending ? suspend.variables?.id : undefined

  function filterOn(next: string) {
    setStatus(next)
    setOffset(0)
  }

  function searchFor(next: string) {
    setQuery(next)
    setOffset(0)
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-end gap-gutter">
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
            onValueChange={filterOn}
            value={status}
          />
        </div>

        <AdminSearchForm
          id="admin-servers-search"
          onSearch={searchFor}
          placeholder={t("admin.servers.searchPlaceholder")}
          query={query}
        />
      </div>

      {page.isPending ? <SkeletonRows label={t("admin.reading")} /> : null}

      {page.isError ? (
        <AdminFailure
          fetching={page.isFetching}
          onRetry={() => {
            page.refetch()
          }}
        />
      ) : null}

      {page.isSuccess && page.data.total === 0 ? (
        <EmptyState icon={HardDrive} title={t("admin.servers.empty")} />
      ) : null}

      {page.isSuccess && page.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.servers.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("admin.range", {
                from: offset + 1,
                to: offset + page.data.data.length,
                total: page.data.total,
              })}
            </span>
          </CardHeader>

          <ul aria-busy={page.isFetching || undefined}>
            {page.data.data.map((server) => (
              <AdminServerRow
                canAct={canActOnPlatform(platformRole)}
                key={server.id}
                onSuspend={(reason) => {
                  suspend.mutate({ id: server.id, name: server.name, reason })
                }}
                server={server}
                suspending={suspending === server.id}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {page.isSuccess ? (
        <Pagination
          nextLabel={t("admin.next")}
          offset={offset}
          onOffsetChange={setOffset}
          pageSize={ADMIN_PAGE_SIZE}
          previousLabel={t("admin.previous")}
          total={page.data.total}
        />
      ) : null}
    </div>
  )
}
