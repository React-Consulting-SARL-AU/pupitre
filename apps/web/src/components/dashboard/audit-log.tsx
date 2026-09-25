import { useQuery } from "@tanstack/react-query"
import { ScrollText } from "lucide-react"
import { auditColumns } from "@/components/dashboard/audit-columns"
import { AsyncDataTable } from "@/components/ui/async-data-table"
import { Callout } from "@/components/ui/callout"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { eventsQueryOptions } from "@/lib/api/queries"
import {
  AUDIT_ACTIONS,
  type AuditAction,
  actionKey,
  EVENTS_PER_PAGE,
} from "@/lib/domain/audit"
import { FILTER_ALL, type ListSearchHandle } from "@/lib/domain/list-search"

export interface AuditLogSearch {
  offset?: number
  action?: AuditAction
}

export type AuditLogProps = ListSearchHandle<AuditLogSearch>

export function AuditLog({ search, setSearch }: AuditLogProps) {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const organizationId = activeOrganization?.id ?? ""
  const offset = search.offset ?? 0
  const page = useQuery({
    ...eventsQueryOptions(organizationId, {
      limit: EVENTS_PER_PAGE,
      offset,
      ...(search.action ? { action: search.action } : {}),
    }),
    enabled: organizationId !== "",
  })

  function actionName(action: string): string {
    const key = actionKey(action)

    return key ? t(key) : action
  }

  if (!activeOrganization) {
    return (
      <Callout
        fix={t("auditUi.noOrganizationFix")}
        title={t("auditUi.noOrganization")}
      />
    )
  }

  return (
    <AsyncDataTable
      columns={auditColumns(t)}
      data={page.data?.data ?? []}
      emptyIcon={ScrollText}
      emptyTitle={t("auditUi.emptyTitle")}
      errorFix={t("auditUi.failedFix")}
      errorTitle={t("auditUi.failed")}
      filters={
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-action">{t("auditUi.action")}</Label>
          <Select
            className="w-[240px]"
            id="audit-action"
            items={[
              { value: FILTER_ALL, label: t("auditUi.allActions") },
              ...AUDIT_ACTIONS.map((candidate) => ({
                value: candidate,
                label: actionName(candidate),
              })),
            ]}
            onValueChange={(next) => {
              setSearch({
                action: next === FILTER_ALL ? undefined : (next as AuditAction),
              })
            }}
            value={search.action ?? FILTER_ALL}
          />
        </div>
      }
      isError={page.isError}
      isFetching={page.isFetching}
      isPending={page.isPending}
      limit={EVENTS_PER_PAGE}
      offset={offset}
      onOffsetChange={(next) => {
        setSearch({ offset: next })
      }}
      refetch={() => {
        page.refetch()
      }}
      rowKey={(event) => event.id}
      title={t("auditUi.title")}
      total={page.data?.total ?? 0}
    />
  )
}
