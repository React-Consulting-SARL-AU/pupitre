import { Dialog as BaseDialog } from "@base-ui-components/react/dialog"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export const DialogRoot = BaseDialog.Root

export const DialogTrigger = BaseDialog.Trigger

export const DialogClose = BaseDialog.Close

export interface DialogPopupProps
  extends ComponentProps<typeof BaseDialog.Popup> {
  title: string
  children: ReactNode
}

export function DialogPopup({
  title,
  className,
  children,
  ...props
}: DialogPopupProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px]" />
      <BaseDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface p-6 shadow-overlay outline-none",
          className
        )}
        {...props}
      >
        <BaseDialog.Title className="font-bold font-display text-[16px] text-ink leading-[1.2]">
          {title}
        </BaseDialog.Title>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
