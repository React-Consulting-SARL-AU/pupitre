import type { LucideIcon } from "lucide-react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Spinner } from "@/components/ui/spinner"
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
  sm: "h-7 gap-1 px-3 text-[13px]",
  md: "h-9 gap-2 px-4 text-[13px]",
}

export interface ButtonLook {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

export function buttonClassName({
  variant = "secondary",
  size = "md",
  className,
}: ButtonLook = {}): string {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium transition-fast",
    "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    className
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  type = "button",
  icon: Icon,
  loading = false,
  disabled = false,
  children,
  ...props
}: ButtonProps) {
  let glyph: ReactNode = null

  if (loading) {
    glyph = <Spinner size={14} />
  } else if (Icon) {
    glyph = <Icon className="size-4 shrink-0" strokeWidth={1.5} />
  }

  return (
    <button
      aria-busy={loading || undefined}
      className={buttonClassName({
        variant,
        size,
        className: cn(loading && "disabled:cursor-progress", className),
      })}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {glyph}
      {children}
    </button>
  )
}
