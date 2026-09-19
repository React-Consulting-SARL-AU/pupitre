import { Ban } from "lucide-react"
import { AdminReasonDialog } from "@/components/admin/admin-reason-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { MAX_REASON_LENGTH } from "@/lib/domain/admin"

export interface AdminBanDialogProps {
  email: string
  busy: boolean
  disabled: boolean
  onConfirm: (reason: string) => void
}

export function AdminBanDialog({
  email,
  busy,
  disabled,
  onConfirm,
}: AdminBanDialogProps) {
  const t = useTranslations()

  return (
    <AdminReasonDialog
      busy={busy}
      busyLabel={t("admin.users.banning")}
      confirmLabel={t("admin.users.ban")}
      description={t("admin.users.banDescription", { email })}
      disabled={disabled}
      fieldId="ban-reason"
      fieldLabel={t("admin.users.banReason")}
      onConfirm={onConfirm}
      requiredMessage={t("admin.users.banReasonRequired")}
      title={t("admin.users.banTitle")}
      tooLongMessage={t("admin.servers.reasonTooLong", {
        max: MAX_REASON_LENGTH,
      })}
      triggerIcon={Ban}
      triggerLabel={t("admin.users.ban")}
    />
  )
}
