import { Link } from "@tanstack/react-router"
import type { DataColumn } from "@/components/ui/async-data-table"
import type { AdminEvent } from "@/lib/api/admin-queries"
import { actionKey, targetKey } from "@/lib/domain/audit"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime } from "@/lib/utils/format"

export function adminEventColumns(t: Translate): DataColumn<AdminEvent>[] {
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
      header: t("admin.events.targetType"),
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
      key: "organization",
      header: t("admin.events.organization"),
      width: "w-40",
      hideBelow: "lg",
      cell: (event) =>
        event.organization ? (
          <Link
            className="block truncate underline-offset-2 hover:underline"
            params={{ id: event.organization.id }}
            to="/dashboard/admin/organizations/$id"
          >
            {event.organization.name}
          </Link>
        ) : (
          t("format.none")
        ),
    },
    {
      key: "actor",
      header: t("auditUi.actor"),
      width: "w-48",
      hideBelow: "md",
      cell: (event) => (
        <span className="block truncate font-data text-[12px]">
          {event.actor?.email ?? t("auditUi.system")}
        </span>
      ),
    },
    {
      key: "created_at",
      header: t("admin.users.createdAt"),
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
