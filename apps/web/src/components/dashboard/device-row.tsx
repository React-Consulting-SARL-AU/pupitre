import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { formatRelative } from "@/lib/utils/format"

export interface DeviceRowDevice {
  id: string
  name: string
  fingerprint: string
  last_used_at: string | null
}

export interface DeviceRowProps {
  device: DeviceRowDevice
  onRevoke: () => void
  revoking: boolean
}

export function DeviceRow({ device, onRevoke, revoking }: DeviceRowProps) {
  const t = useTranslations()

  return (
    <li
      aria-busy={revoking || undefined}
      className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-[13px] text-ink">
          {device.name}
        </p>
        <p className="truncate font-data text-[12px] text-ink-3">
          {device.fingerprint}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[12px] text-ink-3">
          {formatRelative(device.last_used_at, t)}
        </span>
        <ConfirmDialog
          busy={revoking}
          busyLabel={t("devices.revoking")}
          confirmLabel={t("devices.revoke")}
          description={t("devices.revokeDescription", { name: device.name })}
          onConfirm={onRevoke}
          title={t("devices.revokeTitle")}
          triggerLabel={t("devices.revoke")}
        />
      </div>
    </li>
  )
}
