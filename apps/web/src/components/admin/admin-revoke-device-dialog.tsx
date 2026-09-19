import { ShieldOff } from "lucide-react"
import { AdminReasonDialog } from "@/components/admin/admin-reason-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"

export interface AdminRevokeDeviceDialogDevice {
  id: string
  name: string
}

export interface AdminRevokeDeviceDialogProps {
  device: AdminRevokeDeviceDialogDevice
  busy: boolean
  onConfirm: (reason: string) => void
}

export function AdminRevokeDeviceDialog({
  device,
  busy,
  onConfirm,
}: AdminRevokeDeviceDialogProps) {
  const t = useTranslations()

  return (
    <AdminReasonDialog
      busy={busy}
      busyLabel={t("admin.users.revoking")}
      confirmLabel={t("admin.users.revokeDevice")}
      description={t("admin.users.revokeDescription", { name: device.name })}
      fieldId={`revoke-reason-${device.id}`}
      fieldLabel={t("admin.servers.reason")}
      onConfirm={onConfirm}
      requiredMessage={t("admin.users.revokeReasonRequired")}
      title={t("admin.users.revokeTitle")}
      tooLongMessage={t("admin.servers.reasonTooLong", {
        max: MAX_REASON_LENGTH,
      })}
      triggerIcon={ShieldOff}
      triggerLabel={t("admin.users.revokeDevice")}
    />
  )
}
