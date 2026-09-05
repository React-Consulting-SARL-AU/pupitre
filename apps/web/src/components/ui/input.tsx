import type { InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-line-strong bg-sunken px-3.5 text-ink placeholder:text-ink-4",
        "transition-colors duration-[120ms] ease-[ease]",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
        "disabled:text-ink-4",
        className
      )}
      {...props}
    />
  )
}
