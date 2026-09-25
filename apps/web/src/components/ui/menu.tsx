import { Menu as BaseMenu } from "@base-ui-components/react/menu"
import { Check } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils/cn"

export const MenuRoot = BaseMenu.Root

export const MenuTrigger = BaseMenu.Trigger

export const MenuRadioGroup = BaseMenu.RadioGroup

export const MenuGroup = BaseMenu.Group

export interface MenuPopupProps extends ComponentProps<typeof BaseMenu.Popup> {
  side?: ComponentProps<typeof BaseMenu.Positioner>["side"]
  align?: ComponentProps<typeof BaseMenu.Positioner>["align"]
}

export function MenuPopup({
  className,
  children,
  side = "bottom",
  align = "start",
  ...props
}: MenuPopupProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} side={side} sideOffset={6}>
        <BaseMenu.Popup
          className={cn(
            "min-w-[220px] rounded-lg bg-surface p-1 shadow-overlay outline-none",
            className
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export function MenuGroupLabel({
  className,
  ...props
}: ComponentProps<typeof BaseMenu.GroupLabel>) {
  return (
    <BaseMenu.GroupLabel
      className={cn("px-2 py-2 text-label", className)}
      {...props}
    />
  )
}

export function MenuItem({
  className,
  ...props
}: ComponentProps<typeof BaseMenu.Item>) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-full px-3 py-2 text-[13px] text-ink outline-none",
        "data-[highlighted]:bg-raised",
        className
      )}
      {...props}
    />
  )
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseMenu.RadioItem>) {
  return (
    <BaseMenu.RadioItem
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-full px-3 py-2 text-[13px] text-ink outline-none",
        "data-[highlighted]:bg-raised",
        className
      )}
      {...props}
    >
      {children}
      <BaseMenu.RadioItemIndicator className="ml-auto flex">
        <Check className="size-4 text-ink" strokeWidth={1.5} />
      </BaseMenu.RadioItemIndicator>
    </BaseMenu.RadioItem>
  )
}

export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof BaseMenu.Separator>) {
  return (
    <BaseMenu.Separator
      className={cn("my-1 h-px bg-line", className)}
      {...props}
    />
  )
}
