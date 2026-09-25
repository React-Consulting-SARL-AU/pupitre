import type { InferDataFromTag } from "@tanstack/react-query"
import type { DataColumn } from "@/components/ui/async-data-table"
import type { eventsQueryOptions } from "@/lib/api/queries"
import { actionKey, targetKey } from "@/lib/domain/audit"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime } from "@/lib/utils/format"

export type OrganizationEvent = InferDataFromTag<
  unknown,
  ReturnType<typeof eventsQueryOptions>["queryKey"]
>["data"][number]

export function auditColumns(t: Translate): DataColumn<OrganizationEvent>[] {
  return [
    {
      key: "action",
      header: t("auditUi.action"),
      cell: (event) => {
        const action = actionKey(event.action)

        return (
          <span className="text-ink">{action ? t(action) : event.action}</span>
        )
      },
    },
    {
      key: "target",
      header: t("auditUi.target"),
      width: "w-[280px]",
      hideBelow: "md",
      cell: (event) => {
        const target = targetKey(event.target_type)

        return (
          <span className="block truncate font-data text-[12px] text-ink-3">
            {target ? t(target) : event.target_type} · {event.target_id}
          </span>
        )
      },
    },
    {
      key: "actor",
      header: t("auditUi.actor"),
      width: "w-48",
      hideBelow: "md",
      cell: (event) => (
        <span className="block truncate font-data text-[12px]">
          {event.actor_email ?? t("auditUi.system")}
        </span>
      ),
    },
    {
      key: "created_at",
      header: t("auditUi.when"),
      width: "w-44",
      align: "end",
      cell: (event) => (
        <span className="font-data text-[12px] text-ink-3">
          {formatDateTime(event.created_at, t)}
        </span>
      ),
    },
  ]
}
