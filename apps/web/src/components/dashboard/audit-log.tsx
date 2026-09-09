import { useQuery } from "@tanstack/react-query"
import { RotateCw, ScrollText } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { eventsQueryOptions } from "@/lib/api/queries"
import {
  AUDIT_ACTIONS,
  actionKey,
  EVENTS_PER_PAGE,
  targetKey,
} from "@/lib/domain/audit"
import { formatDateTime } from "@/lib/utils/format"

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

  function targetName(targetType: string): string {
    const key = targetKey(targetType)

    return key ? t(key) : targetType
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
        <EmptyState
          description={t("auditUi.emptyDescription")}
          icon={ScrollText}
          title={t("auditUi.emptyTitle")}
        />
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
              <li
                className="flex flex-wrap items-baseline justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={event.id}
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    {actionName(event.action)}
                  </p>
                  <p className="truncate font-data text-[12px] text-ink-3">
                    {targetName(event.target_type)} · {event.target_id}
                  </p>
                </div>
                <div className="text-right">
                  <p className="truncate font-data text-[12px] text-ink-2">
                    {event.actor_email ?? t("auditUi.system")}
                  </p>
                  <p className="font-data text-[12px] text-ink-3 tabular-nums">
                    {formatDateTime(event.created_at, t)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {page.isSuccess && page.data.total > EVENTS_PER_PAGE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - EVENTS_PER_PAGE))
            }}
            size="sm"
          >
            {t("auditUi.newer")}
          </Button>
          <Button
            disabled={offset + EVENTS_PER_PAGE >= page.data.total}
            onClick={() => {
              setOffset(offset + EVENTS_PER_PAGE)
            }}
            size="sm"
          >
            {t("auditUi.older")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
