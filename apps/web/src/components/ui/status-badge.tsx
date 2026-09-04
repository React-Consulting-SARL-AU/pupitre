import { StatusDot } from "@/components/ui/status-dot"
import type { StatusLook } from "@/lib/domain/server-status"
import { cn } from "@/lib/utils/cn"

export interface StatusBadgeProps {
  look: StatusLook
  className?: string
}

export function StatusBadge({ look, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <StatusDot label={look.label} shape={look.shape} tone={look.tone} />
      <span className="text-[13px] text-ink-2">{look.label}</span>
    </span>
  )
}
