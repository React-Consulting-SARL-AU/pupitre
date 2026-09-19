import { useQuery } from "@tanstack/react-query"
import { RotateCw, ScrollText } from "lucide-react"
import { useState } from "react"
import { AuditRow } from "@/components/dashboard/audit-row"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select } from "@/components/ui/select"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { eventsQueryOptions } from "@/lib/api/queries"
import { AUDIT_ACTIONS, actionKey, EVENTS_PER_PAGE } from "@/lib/domain/audit"

const ALL_ACTIONS = ""

export function AuditLog() {
  const t = useTranslations()
  const { activeOrganization } = useDashboardContext()
  const [action, setAction] = useState(ALL_ACTIONS)
  const [offset, setOffset] = useState(0)
  const organizationId = activeOrganization?.id ?? ""
  const page = useQuery({
    ...eventsQueryOptions(organizationId, {
      limit: EVENTS_PER_PAGE,
      offset,
      ...(action === ALL_ACTIONS ? {} : { action }),
    }),
    enabled: organizationId !== "",
  })

  function actionName(action: string): string {
    const key = actionKey(action)

    return key ? t(key) : action
  }

  function filterOn(next: string) {
    setAction(next)
    setOffset(0)
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
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-action">{t("auditUi.action")}</Label>
          <Select
            className="w-[240px]"
            id="audit-action"
            items={[
              { value: ALL_ACTIONS, label: t("auditUi.allActions") },
              ...AUDIT_ACTIONS.map((candidate) => ({
                value: candidate,
                label: actionName(candidate),
              })),
            ]}
            onValueChange={filterOn}
            value={action}
          />
        </div>
      </div>

      {page.isPending ? <SkeletonRows label={t("auditUi.reading")} /> : null}

      {page.isError ? (
        <Callout
          action={
            <Button
              icon={RotateCw}
              loading={page.isFetching}
              onClick={() => {
                page.refetch()
              }}
              size="sm"
            >
              {t("common.retry")}
            </Button>
          }
          fix={t("auditUi.failedFix")}
          title={t("auditUi.failed")}
          tone="danger"
        />
      ) : null}

      {page.isSuccess && page.data.total === 0 ? (
        <EmptyState icon={ScrollText} title={t("auditUi.emptyTitle")} />
      ) : null}

      {page.isSuccess && page.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("auditUi.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("auditUi.range", {
                from: offset + 1,
                to: offset + page.data.data.length,
                total: page.data.total,
              })}
            </span>
          </CardHeader>

          <ul aria-busy={page.isFetching || undefined}>
            {page.data.data.map((event) => (
              <AuditRow
                actor={event.actor_email}
                event={event}
                key={event.id}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {page.isSuccess ? (
        <Pagination
          nextLabel={t("auditUi.older")}
          offset={offset}
          onOffsetChange={setOffset}
          pageSize={EVENTS_PER_PAGE}
          previousLabel={t("auditUi.newer")}
          total={page.data.total}
        />
      ) : null}
    </div>
  )
}
