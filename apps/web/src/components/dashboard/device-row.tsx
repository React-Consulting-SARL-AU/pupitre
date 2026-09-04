import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { formatRelative } from "@/lib/utils/format"

export interface DeviceRowDevice {
  id: string
  name: string
  fingerprint: string
  last_used_at: string | null
}

export interface DeviceRowProps {
  device: DeviceRowDevice
  onRevoke: (id: string) => void
  pending: boolean
}

export function DeviceRow({ device, onRevoke, pending }: DeviceRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0">
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
          {formatRelative(device.last_used_at)}
        </span>
        <ConfirmDialog
          confirmLabel="Révoquer"
          description={`La clé de « ${device.name} » est retirée de tous vos serveurs en moins d'une minute. L'appareil devra être réajouté depuis l'app.`}
          onConfirm={() => {
            onRevoke(device.id)
          }}
          pending={pending}
          title="Révoquer cet appareil ?"
          triggerLabel="Révoquer"
        />
      </div>
    </li>
  )
}
