import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils/cn"

export type DangerZoneTone = "warning" | "danger"

export interface DangerZoneProps {
  title: string
  description: string
  action: ReactNode
  tone?: DangerZoneTone
  className?: string
}

const BORDERS: Record<DangerZoneTone, string> = {
  warning: "border border-warn",
  danger: "border border-danger",
}

export function DangerZone({
  title,
  description,
  action,
  tone = "danger",
  className,
}: DangerZoneProps) {
  return (
    <Card
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 p-4",
        BORDERS[tone],
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-[13px] text-ink">{title}</p>
        <p className="text-[13px] text-ink-2">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{action}</div>
    </Card>
  )
}
