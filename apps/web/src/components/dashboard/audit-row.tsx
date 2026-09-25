import { useTranslations } from "@/hooks/use-locale"
import type { AdminOrganizationDetail } from "@/lib/api/admin-queries"
import { actionKey, targetKey } from "@/lib/domain/audit"
import { formatDateTime } from "@/lib/utils/format"

export type AuditRowEvent = AdminOrganizationDetail["events"][number]

export interface AuditRowProps {
  event: AuditRowEvent
}

export function AuditRow({ event }: AuditRowProps) {
  const t = useTranslations()
  const action = actionKey(event.action)
  const target = targetKey(event.target_type)

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[13px] text-ink">
          {action ? t(action) : event.action}
        </p>
        <p className="truncate font-data text-[12px] text-ink-3">
          {target ? t(target) : event.target_type} · {event.target_id}
        </p>
      </div>
      <div className="text-right">
        <p className="truncate font-data text-[12px] text-ink-2">
          {event.actor?.email ?? t("auditUi.system")}
        </p>
        <p className="font-data text-[12px] text-ink-3 tabular-nums">
          {formatDateTime(event.created_at, t)}
        </p>
      </div>
    </li>
  )
}
