import type { TextareaHTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-32 w-full rounded-md border border-line-strong bg-sunken px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-4",
        "transition-fast",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
        "disabled:text-ink-4",
        className
      )}
      {...props}
    />
  )
}
