import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import type { StatusLook } from "@/lib/domain/server-status"
import { cn } from "@/lib/utils/cn"

export interface StatusBadgeProps {
  look: StatusLook | null
  className?: string
}

export function StatusBadge({ look, className }: StatusBadgeProps) {
  const t = useTranslations()

  if (!look) {
    return null
  }

  const label = t(look.label)

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <StatusDot label={label} shape={look.shape} tone={look.tone} />
      <span className="text-[13px] text-ink-2">{label}</span>
    </span>
  )
}
