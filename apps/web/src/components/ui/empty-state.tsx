import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md bg-surface px-6 py-12 text-center shadow-raised">
      {Icon ? <Icon className="size-6 text-ink-3" strokeWidth={1.5} /> : null}
      <p className="font-medium text-[13px] text-ink">{title}</p>
      {description ? (
        <p className="max-w-md text-[13px] text-ink-2">{description}</p>
      ) : null}
      {action}
    </div>
  )
}
