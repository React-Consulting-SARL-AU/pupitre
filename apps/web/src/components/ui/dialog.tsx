import { Dialog as BaseDialog } from "@base-ui-components/react/dialog"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export const DialogRoot = BaseDialog.Root

export const DialogTrigger = BaseDialog.Trigger

export const DialogClose = BaseDialog.Close

export type DialogSize = "sm" | "md" | "lg" | "nav"

export type DialogPlacement = "center" | "top" | "start"

export interface DialogPopupProps
  extends Omit<ComponentProps<typeof BaseDialog.Popup>, "title"> {
  title: string
  /** Named for the screen reader only: the dialog's own content says what it is. */
  titleHidden?: boolean
  description?: string
  /** Set beside the title, such as a download or a close button. */
  actions?: ReactNode
  size?: DialogSize
  placement?: DialogPlacement
  children: ReactNode
}

const SIZES: Record<DialogSize, string> = {
  sm: "w-[min(440px,calc(100vw-32px))]",
  md: "w-[min(560px,calc(100vw-32px))]",
  lg: "flex h-[85vh] w-[min(1024px,calc(100vw-32px))] flex-col gap-3",
  nav: "w-[min(288px,calc(100vw-48px))]",
}

const PLACEMENTS: Record<DialogPlacement, string> = {
  center:
    "top-1/2 left-1/2 max-h-[calc(100vh-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg p-6",
  top: "top-[12vh] left-1/2 -translate-x-1/2 overflow-hidden rounded-lg",
  start:
    "inset-y-0 left-0 flex flex-col transition-soft data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full",
}

const TITLE_CLASS = "font-bold font-display text-[16px] text-ink leading-[1.2]"

export function DialogPopup({
  title,
  titleHidden = false,
  description,
  actions,
  size = "md",
  placement = "center",
  className,
  children,
  ...props
}: DialogPopupProps) {
  const heading = (
    <BaseDialog.Title
      className={cn(
        titleHidden ? "sr-only" : TITLE_CLASS,
        actions && "min-w-0 truncate"
      )}
    >
      {title}
    </BaseDialog.Title>
  )

  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 bg-base/70 backdrop-blur-[2px] transition-fast data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          "fixed bg-surface shadow-overlay outline-none",
          PLACEMENTS[placement],
          SIZES[size],
          className
        )}
        {...props}
      >
        {actions ? (
          <header className="flex items-center justify-between gap-3">
            {heading}
            <div className="flex shrink-0 items-center gap-1">{actions}</div>
          </header>
        ) : (
          heading
        )}
        {description ? (
          <BaseDialog.Description className="mt-2 text-[13px] text-ink-2">
            {description}
          </BaseDialog.Description>
        ) : null}
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
