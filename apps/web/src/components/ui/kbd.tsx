import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type KbdProps = HTMLAttributes<HTMLElement>

export function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center rounded-sm border border-line-strong bg-sunken px-1.5 font-data text-[11px] text-ink-2",
        className
      )}
      {...props}
    />
  )
}
