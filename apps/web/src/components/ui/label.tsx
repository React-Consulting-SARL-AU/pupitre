import type { LabelHTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export function Label({ className, ...props }: LabelProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or wrap the control
    <label className={cn("text-label", className)} {...props} />
  )
}
