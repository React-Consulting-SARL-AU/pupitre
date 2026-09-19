import { Trash2 } from "lucide-react"
import { AdminReasonDialog } from "@/components/admin/admin-reason-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"
import { purgeable } from "@/lib/domain/server-deletion"
import { formatDateTime } from "@/lib/utils/format"

export interface AdminDeleteServerDialogServer {
  id: string
  name: string
  status: string
  decommission_at: string | Date | null
  organization: { name: string }
}

export interface AdminDeleteServerDialogProps {
  server: AdminDeleteServerDialogServer
  busy: boolean
  onConfirm: (reason: string) => void
}

/** The same two steps as the owner's: revoke first, purge the revoked line second. */
export function AdminDeleteServerDialog({
  server,
  busy,
  onConfirm,
}: AdminDeleteServerDialogProps) {
  const t = useTranslations()
  const purge = purgeable(server.status)
  const label = purge ? t("admin.servers.purge") : t("admin.servers.delete")

  return (
    <AdminReasonDialog
      busy={busy}
      busyLabel={t("admin.servers.deleting")}
      confirmLabel={label}
      description={
        purge
          ? t("admin.servers.purgeDescription", {
              name: server.name,
              date: server.decommission_at
                ? formatDateTime(server.decommission_at, t)
                : t("format.none"),
            })
          : t("admin.servers.deleteDescription", {
              name: server.name,
              organization: server.organization.name,
            })
      }
      fieldId={`delete-reason-${server.id}`}
      fieldLabel={t("admin.servers.reason")}
      onConfirm={onConfirm}
      requiredMessage={t("admin.servers.reasonRequired")}
      title={
        purge ? t("admin.servers.purgeTitle") : t("admin.servers.deleteTitle")
      }
      tooLongMessage={t("admin.servers.reasonTooLong", {
        max: MAX_REASON_LENGTH,
      })}
      triggerIcon={Trash2}
      triggerLabel={label}
    />
  )
}
