import { Dialog } from "@base-ui-components/react/dialog"
import type { LucideIcon } from "lucide-react"
import { Button, type ButtonVariant } from "@/components/ui/button"

export interface ConfirmDialogProps {
  triggerLabel: string
  triggerIcon?: LucideIcon
  triggerVariant?: ButtonVariant
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
}

export function ConfirmDialog({
  triggerLabel,
  triggerIcon: TriggerIcon,
  triggerVariant = "danger",
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button size="sm" variant={triggerVariant}>
            {TriggerIcon ? (
              <TriggerIcon className="size-4" strokeWidth={1.5} />
            ) : null}
            {triggerLabel}
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none">
          <Dialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] text-ink-2">
            {description}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost">Annuler</Button>} />
            <Dialog.Close
              render={
                <Button disabled={pending} onClick={onConfirm} variant="danger">
                  {confirmLabel}
                </Button>
              }
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
