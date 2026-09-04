import { cn } from "@/lib/utils/cn"

export interface FieldErrorProps {
  children?: string | null
  className?: string
}

export function FieldError({ children, className }: FieldErrorProps) {
  if (!children) {
    return null
  }

  return (
    <p className={cn("text-[12px] text-danger", className)} role="alert">
      {children}
    </p>
  )
}
