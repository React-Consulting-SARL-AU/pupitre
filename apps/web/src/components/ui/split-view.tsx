import type { ReactNode } from "react"
import { cn } from "@/lib/utils/cn"

export interface SplitViewProps {
  list: ReactNode
  detail: ReactNode
  /** Below `lg` only one pane fits: the open thread takes the screen. */
  detailOpen: boolean
  className?: string
}

export function SplitView({
  list,
  detail,
  detailOpen,
  className,
}: SplitViewProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 gap-gutter", className)}>
      <div
        className={cn(
          "min-w-0 flex-1 lg:block lg:max-w-[420px] xl:max-w-[460px]",
          detailOpen && "hidden"
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          detailOpen ? "block" : "hidden lg:block"
        )}
      >
        {detail}
      </div>
    </div>
  )
}
