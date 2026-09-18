import type { ReactNode } from "react"
import { useTranslations } from "@/hooks/use-locale"
import { actionKey, targetKey } from "@/lib/domain/audit"
import { formatDateTime } from "@/lib/utils/format"

export interface AuditRowEvent {
  action: string
  target_type: string
  target_id: string
  created_at: string
}

export interface AuditRowProps {
  event: AuditRowEvent
  /** Who did it, already written out; nothing when the platform did it by itself. */
  actor: string | null
  /** What the platform journal adds and an organisation's does not: whose organisation the line belongs to. */
  context?: ReactNode
}

/** One line of a journal, read the same way on an organisation's page and on the platform's. */
export function AuditRow({ event, actor, context }: AuditRowProps) {
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
        {context}
        <p className="truncate font-data text-[12px] text-ink-2">
          {actor ?? t("auditUi.system")}
        </p>
        <p className="font-data text-[12px] text-ink-3 tabular-nums">
          {formatDateTime(event.created_at, t)}
        </p>
      </div>
    </li>
  )
}
