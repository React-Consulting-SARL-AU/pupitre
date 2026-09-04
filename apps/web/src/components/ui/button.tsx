import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils/cn"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

export type ButtonSize = "sm" | "md"

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-inverse text-inverse-ink shadow-raised hover:opacity-90 disabled:opacity-40",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-raised disabled:text-ink-4",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink disabled:text-ink-4",
  danger:
    "border border-line-strong bg-surface text-danger hover:bg-raised disabled:text-ink-4",
}

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1 px-2 text-[13px]",
  md: "h-9 gap-2 px-3 text-[13px]",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-medium transition-[background-color,opacity,color] duration-[120ms] ease-[ease]",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      type={type}
      {...props}
    />
  )
}
