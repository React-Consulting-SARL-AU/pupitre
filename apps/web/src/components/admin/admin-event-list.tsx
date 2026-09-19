import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { ScrollText } from "lucide-react"
import { adminEventColumns } from "@/components/admin/admin-event-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useTranslations } from "@/hooks/use-locale"
import { adminEventsQueryOptions } from "@/lib/api/admin-queries"
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  actionKey,
  targetKey,
} from "@/lib/domain/audit"
import type { ListSearchHandle } from "@/lib/domain/list-search"

const ALL = ""

export interface AdminEventListSearch {
  offset?: number
  organization_id?: string
  action?: string
  target_type?: string
}

export type AdminEventListProps = ListSearchHandle<AdminEventListSearch>

export function AdminEventList({ search, setSearch }: AdminEventListProps) {
  const t = useTranslations()
  const offset = search.offset ?? 0
  const organization = search.organization_id ?? ""
  const action = search.action ?? ALL
  const targetType = search.target_type ?? ALL
  const page = useQuery(
    adminEventsQueryOptions({
      limit: ADMIN_PAGE_SIZE,
      offset,
      ...(organization === "" ? {} : { organization_id: organization }),
      ...(action === ALL ? {} : { action }),
      ...(targetType === ALL ? {} : { target_type: targetType }),
    })
  )

  function actionName(candidate: string): string {
    const key = actionKey(candidate)

    return key ? t(key) : candidate
  }

  function targetName(candidate: string): string {
    const key = targetKey(candidate)

    return key ? t(key) : candidate
  }

  return (
    <AsyncDataTable
      columns={adminEventColumns(t)}
      data={page.data?.data ?? []}
      emptyIcon={ScrollText}
      emptyTitle={t("admin.events.empty")}
      filters={
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-events-action">{t("auditUi.action")}</Label>
            <Select
              className="w-[240px]"
              id="admin-events-action"
              items={[
                { value: ALL, label: t("auditUi.allActions") },
                ...AUDIT_ACTIONS.map((candidate) => ({
                  value: candidate,
                  label: actionName(candidate),
                })),
              ]}
              onValueChange={(next) => {
                setSearch({ action: next })
              }}
              value={action}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-events-target">
              {t("admin.events.targetType")}
            </Label>
            <Select
              className="w-[200px]"
              id="admin-events-target"
              items={[
                { value: ALL, label: t("admin.events.allTargets") },
                ...AUDIT_TARGET_TYPES.map((candidate) => ({
                  value: candidate,
                  label: targetName(candidate),
                })),
              ]}
              onValueChange={(next) => {
                setSearch({ target_type: next })
              }}
              value={targetType}
            />
          </div>
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
      rowKey={(event) => event.id}
      search={{
        id: "admin-events-organization",
        value: organization,
        label: t("admin.events.organization"),
        placeholder: t("admin.events.organizationPlaceholder"),
        onChange: (next) => {
          setSearch({ organization_id: next })
        },
      }}
      title={t("admin.events.title")}
      total={page.data?.total ?? 0}
    />
  )
}
