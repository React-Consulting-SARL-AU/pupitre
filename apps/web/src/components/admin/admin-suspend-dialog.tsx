import { Ban } from "lucide-react"
import { AdminReasonDialog } from "@/components/admin/admin-reason-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"

export interface AdminSuspendDialogServer {
  id: string
  name: string
  organization: { name: string }
}

export interface AdminSuspendDialogProps {
  server: AdminSuspendDialogServer
  busy: boolean
  onConfirm: (reason: string) => void
}

export function AdminSuspendDialog({
  server,
  busy,
  onConfirm,
}: AdminSuspendDialogProps) {
  const t = useTranslations()

  return (
    <AdminReasonDialog
      busy={busy}
      busyLabel={t("admin.servers.suspending")}
      confirmLabel={t("admin.servers.suspend")}
      description={t("admin.servers.suspendDescription", {
        name: server.name,
        organization: server.organization.name,
      })}
      fieldId={`suspend-reason-${server.id}`}
      fieldLabel={t("admin.servers.reason")}
      onConfirm={onConfirm}
      requiredMessage={t("admin.servers.reasonRequired")}
      title={t("admin.servers.suspendTitle")}
      tooLongMessage={t("admin.servers.reasonTooLong", {
        max: MAX_REASON_LENGTH,
      })}
      triggerIcon={Ban}
      triggerLabel={t("admin.servers.suspend")}
    />
  )
}
