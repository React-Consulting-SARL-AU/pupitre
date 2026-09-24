import { Link } from "@tanstack/react-router"
import type { DataColumn } from "@/components/ui/async-data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { Backup } from "@/lib/api/queries"
import type { Translate } from "@/lib/i18n/i18n"
import {
  formatBackupContents,
  formatBytes,
  formatDateTime,
} from "@/lib/utils/format"

export interface BackupColumnsHandlers {
  canForget: boolean
  forgetting: string | undefined
  onForget: (backup: Backup) => void
}

export function backupColumns(
  t: Translate,
  { canForget, forgetting, onForget }: BackupColumnsHandlers
): DataColumn<Backup>[] {
  return [
    {
      key: "created_at",
      header: t("backups.column.date"),
      cell: (backup) => (
        <span className="text-ink">{formatDateTime(backup.created_at, t)}</span>
      ),
    },
    {
      key: "server",
      header: t("backups.column.server"),
      interactive: true,
      cell: (backup) =>
        backup.server_id ? (
          <Link
            className="text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
            params={{ id: backup.server_id }}
            to="/dashboard/servers/$id"
          >
            {backup.server_name}
          </Link>
        ) : (
          <span className="text-ink-3">
            {t("backups.serverRemoved", { name: backup.server_name })}
          </span>
        ),
    },
    {
      key: "trigger",
      header: t("backups.column.trigger"),
      width: "w-32",
      hideBelow: "sm",
      cell: (backup) => t(`backups.trigger.${backup.trigger}`),
    },
    {
      key: "contents",
      header: t("backups.column.contents"),
      hideBelow: "lg",
      cell: (backup) => formatBackupContents(backup.counts, t),
    },
    {
      key: "bytes",
      header: t("backups.column.size"),
      width: "w-28",
      align: "end",
      hideBelow: "md",
      cell: (backup) => (
        <span className="font-data text-[12px]">
          {formatBytes(backup.bytes, t)}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("table.actions"),
      width: "w-32",
      align: "end",
      interactive: true,
      cell: (backup) =>
        canForget && backup.server_id === null ? (
          <ConfirmDialog
            busy={forgetting === backup.id}
            busyLabel={t("backups.forgetting")}
            confirmLabel={t("backups.forget")}
            description={t("backups.forgetDescription", {
              server: backup.server_name,
              date: formatDateTime(backup.created_at, t),
            })}
            onConfirm={() => {
              onForget(backup)
            }}
            title={t("backups.forgetTitle")}
            triggerLabel={t("backups.forget")}
          />
        ) : null,
    },
  ]
}
