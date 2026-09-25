import { AlertDialog } from "@base-ui-components/react/alert-dialog"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { Button, type ButtonVariant } from "@/components/ui/button"
import { useTranslations } from "@/hooks/use-locale"

export interface ConfirmDialogProps {
  triggerLabel: string
  triggerIcon?: LucideIcon
  triggerVariant?: ButtonVariant
  triggerIconOnly?: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  busyLabel?: string
}

export function ConfirmDialog({
  triggerLabel,
  triggerIcon: TriggerIcon,
  triggerVariant = "danger",
  triggerIconOnly = false,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  busyLabel,
}: ConfirmDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const label = busy && busyLabel ? busyLabel : triggerLabel

  return (
    <AlertDialog.Root onOpenChange={setOpen} open={open}>
      <AlertDialog.Trigger
        render={
          <Button
            aria-label={triggerIconOnly ? label : undefined}
            className={triggerIconOnly ? "w-7 px-0" : undefined}
            icon={TriggerIcon}
            loading={busy}
            size="sm"
            title={triggerIconOnly ? label : undefined}
            variant={triggerVariant}
          >
            {triggerIconOnly ? null : label}
          </Button>
        }
      />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none">
          <AlertDialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[13px] text-ink-2">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Close
              render={<Button variant="ghost">{t("common.cancel")}</Button>}
            />
            <Button
              onClick={() => {
                setOpen(false)
                onConfirm()
              }}
              variant="danger"
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
