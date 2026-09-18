import { ADMIN_PAGE_SIZE } from "@pupitre/shared/platform"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ScrollText, Search } from "lucide-react"
import { useState } from "react"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AuditRow } from "@/components/dashboard/audit-row"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pagination } from "@/components/ui/pagination"
import { Select } from "@/components/ui/select"
import { SkeletonRows } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { adminEventsQueryOptions } from "@/lib/api/admin-queries"
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  actionKey,
  targetKey,
} from "@/lib/domain/audit"

const ALL = ""

export interface AdminEventListProps {
  /** The organisation a link arrived with; the field shows it and the reader can clear it. */
  organizationId?: string
}

export function AdminEventList({ organizationId = "" }: AdminEventListProps) {
  const t = useTranslations()
  const [organization, setOrganization] = useState(organizationId)
  const [action, setAction] = useState(ALL)
  const [targetType, setTargetType] = useState(ALL)
  const [offset, setOffset] = useState(0)
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
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-end gap-gutter">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()

            const typed = new FormData(event.currentTarget).get(
              "organization_id"
            )

            setOrganization(typeof typed === "string" ? typed.trim() : "")
            setOffset(0)
          }}
        >
          <div className="flex min-w-[240px] flex-col gap-2">
            <Label htmlFor="admin-events-organization">
              {t("admin.events.organization")}
            </Label>
            <Input
              autoComplete="off"
              defaultValue={organization}
              id="admin-events-organization"
              name="organization_id"
              placeholder={t("admin.events.organizationPlaceholder")}
              type="search"
            />
          </div>
          <Button icon={Search} type="submit">
            {t("admin.searchAction")}
          </Button>
        </form>

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
              setAction(next)
              setOffset(0)
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
              setTargetType(next)
              setOffset(0)
            }}
            value={targetType}
          />
        </div>
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
        <EmptyState icon={ScrollText} title={t("admin.events.empty")} />
      ) : null}

      {page.isSuccess && page.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.events.title")}</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {t("admin.range", {
                from: offset + 1,
                to: offset + page.data.data.length,
                total: page.data.total,
              })}
            </span>
          </CardHeader>

          <ul aria-busy={page.isFetching || undefined}>
            {page.data.data.map((event) => (
              <AuditRow
                actor={event.actor?.email ?? null}
                context={
                  event.organization ? (
                    <Link
                      className="block truncate text-[12px] text-ink-2 underline-offset-2 hover:underline"
                      params={{ id: event.organization.id }}
                      to="/dashboard/admin/organizations/$id"
                    >
                      {event.organization.name}
                    </Link>
                  ) : null
                }
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
          pageSize={ADMIN_PAGE_SIZE}
          previousLabel={t("auditUi.newer")}
          total={page.data.total}
        />
      ) : null}
    </div>
  )
}
