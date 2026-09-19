import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import type { ReleaseChannel } from "@pupitre/shared/releases"
import { useQuery } from "@tanstack/react-query"
import { Ban, HardDrive, RotateCcw, Rss, X } from "lucide-react"
import { useState } from "react"
import {
  type AdminServerRowServer,
  adminServerColumns,
} from "@/components/admin/admin-server-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Button } from "@/components/ui/button"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { Label } from "@/components/ui/label"
import type { RowAction } from "@/components/ui/row-actions-menu"
import { Select } from "@/components/ui/select"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminServer,
  adminServersQueryOptions,
  restoreServer,
  setServerChannel,
  suspendServer,
} from "@/lib/api/admin-queries"
import {
  type AdminServerPageQuery,
  type AdminSortDirection,
  queryKeys,
} from "@/lib/api/queries"
import {
  canActOnPlatform,
  canRestore,
  canSuspend,
  channelKey,
} from "@/lib/domain/admin"
import type { ListSearchHandle, SortDirection } from "@/lib/domain/list-search"
import { SERVER_STATUSES, statusLook } from "@/lib/domain/server-status"
import type { ConfirmFormValues } from "@/lib/schemas/confirm-form"

const ALL = ""

export const SERVER_SORTS = ["created_at", "last_heartbeat_at", "name"] as const

export const SERVER_SORT: ServerSort = "created_at"

type ServerSort = (typeof SERVER_SORTS)[number]

interface ChannelTarget {
  id: string
  name: string
  channel: ReleaseChannel
}

export interface AdminServerListSearch {
  q?: string
  offset?: number
  status?: string
  organization_id?: string
  stale?: boolean
  sort?: string
  direction?: SortDirection
}

export type AdminServerListProps = ListSearchHandle<AdminServerListSearch>

function toSort(value: string | undefined): ServerSort {
  return SERVER_SORTS.find((sort) => sort === value) ?? SERVER_SORT
}

/** The three filter values a select can hold for a flag the address carries as a word. */
function flagValue(flag: boolean | undefined): string {
  if (flag === undefined) {
    return ALL
  }

  return flag ? "true" : "false"
}

function readFlag(value: string): boolean | undefined {
  if (value === ALL) {
    return undefined
  }

  return value === "true"
}

export function AdminServerList({ search, setSearch }: AdminServerListProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const [suspending, setSuspending] = useState<AdminServerRowServer | null>(
    null
  )
  const offset = search.offset ?? 0
  const query = search.q ?? ""
  const status = search.status ?? ALL
  const organizationId = search.organization_id ?? ""
  const sort = toSort(search.sort)
  const direction: AdminSortDirection = search.direction ?? "asc"
  const pageQuery: AdminServerPageQuery = {
    limit: ADMIN_PAGE_SIZE,
    offset,
    sort,
    direction,
    ...(status === ALL ? {} : { status }),
    ...(organizationId === "" ? {} : { organization_id: organizationId }),
    ...(search.stale === undefined ? {} : { stale: search.stale }),
    ...(query === "" ? {} : { q: query }),
  }
  const page = useQuery(adminServersQueryOptions(pageQuery))
  const touched = [queryKeys.admin.allServers, queryKeys.admin.overview]

  const suspendedName = suspending?.name ?? ""
  const suspend = useConfirmMutation<ConfirmFormValues>({
    mutationFn: (values) => suspendServer(suspending?.id ?? "", values.reason),
    invalidate: touched,
    done: () => t("admin.servers.suspended", { name: suspendedName }),
    failed: {
      title: t("admin.servers.suspendFailed"),
      fix: t("admin.servers.suspendFailedFix"),
    },
    onDone: () => {
      setSuspending(null)
    },
  })
  const restore = useOptimisticMutation<AdminServerRowServer, AdminServer>({
    mutationFn: (server) => restoreServer(server.id),
    invalidate: touched,
    toast: {
      failed: () => ({
        title: t("admin.servers.restoreFailed"),
        fix: t("admin.servers.restoreFailedFix"),
      }),
    },
  })
  const channel = useOptimisticMutation<ChannelTarget>({
    mutationFn: (target) => setServerChannel(target.id, target.channel),
    invalidate: touched,
    toast: {
      done: (_data, target) =>
        t("admin.servers.channelApplied", {
          name: target.name,
          channel: t(
            channelKey(target.channel) ?? "admin.releases.channel.stable"
          ),
        }),
      failed: () => ({
        title: t("admin.servers.channelFailed"),
        fix: t("admin.servers.channelFailedFix"),
      }),
    },
  })
  const acts = canActOnPlatform(platformRole)
  const organizationName =
    page.data?.data.find((server) => server.organization.id === organizationId)
      ?.organization.name ?? organizationId

  function rowActions(server: AdminServerRowServer): RowAction[] {
    if (!acts) {
      return []
    }

    const next: ReleaseChannel = server.channel === "beta" ? "stable" : "beta"

    return [
      ...(canSuspend(server.status)
        ? [
            {
              label: t("admin.servers.suspend"),
              icon: Ban,
              tone: "danger" as const,
              onSelect: () => {
                setSuspending(server)
              },
            },
          ]
        : []),
      ...(canRestore(server.suspended_reason)
        ? [
            {
              label: t("admin.servers.restore"),
              icon: RotateCcw,
              onSelect: () => {
                restore.mutate(server)
              },
            },
          ]
        : []),
      ...(server.status === "revoked"
        ? []
        : [
            {
              label: t(
                next === "beta"
                  ? "admin.servers.toBeta"
                  : "admin.servers.toStable"
              ),
              icon: Rss,
              onSelect: () => {
                channel.mutate({
                  id: server.id,
                  name: server.name,
                  channel: next,
                })
              },
            },
          ]),
    ]
  }

  return (
    <>
      <AsyncDataTable
        columns={adminServerColumns(t)}
        data={page.data?.data ?? []}
        emptyIcon={HardDrive}
        emptyTitle={t("admin.servers.empty")}
        filters={
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-servers-status">
                {t("admin.servers.status")}
              </Label>
              <Select
                className="w-[200px]"
                id="admin-servers-status"
                items={[
                  { value: ALL, label: t("admin.servers.allStatuses") },
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="admin-servers-stale">
                {t("admin.servers.freshness")}
              </Label>
              <Select
                className="w-[220px]"
                id="admin-servers-stale"
                items={[
                  { value: ALL, label: t("admin.servers.anyFreshness") },
                  { value: "true", label: t("status.stale") },
                  { value: "false", label: t("admin.servers.fresh") },
                ]}
                onValueChange={(next) => {
                  setSearch({ stale: readFlag(next) })
                }}
                value={flagValue(search.stale)}
              />
            </div>

            {organizationId === "" ? null : (
              <Button
                icon={X}
                onClick={() => {
                  setSearch({ organization_id: undefined })
                }}
                size="sm"
                title={t("admin.servers.everyOrganization")}
                variant="secondary"
              >
                {t("admin.servers.organizationFilter", {
                  name: organizationName,
                })}
              </Button>
            )}
          </>
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
        rowActions={rowActions}
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
        sort={{
          key: sort,
          direction,
          onChange: (key, next) => {
            setSearch({ sort: toSort(key), direction: next })
          },
        }}
        title={t("admin.servers.title")}
        total={page.data?.total ?? 0}
      />

      {suspending ? (
        <ConfirmFormDialog
          busy={suspend.busy}
          busyLabel={t("admin.servers.suspending")}
          confirmLabel={t("admin.servers.suspend")}
          description={t("admin.servers.suspendDescription", {
            name: suspending.name,
            organization: suspending.organization.name,
          })}
          id={`suspend-${suspending.id}`}
          key={suspending.id}
          onConfirm={suspend.run}
          onOpenChange={(next) => {
            if (!next) {
              setSuspending(null)
              suspend.reset()
            }
          }}
          open
          reason="required"
          reasonLabel={t("admin.servers.reason")}
          reasonRequiredMessage={t("admin.servers.reasonRequired")}
          refusal={suspend.refusal}
          title={t("admin.servers.suspendTitle")}
          triggerLabel={t("admin.servers.suspend")}
        />
      ) : null}
    </>
  )
}
