import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils/cn"

export interface FoldableCardProps {
  title: string
  children: ReactNode
  className?: string
}

// Foldable so that, stacked on a narrow screen, the panes never push the page out of reach.
export function FoldableCard({
  title,
  children,
  className,
}: FoldableCardProps) {
  return (
    <details
      className={cn("group rounded-lg bg-surface shadow-raised", className)}
      open
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3",
          "[&::-webkit-details-marker]:hidden",
          "border-line group-open:border-b",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:-outline-offset-2"
        )}
      >
        <CardTitle>{title}</CardTitle>
        <ChevronDown
          className="size-4 shrink-0 text-ink-3 transition-fast group-open:rotate-180"
          strokeWidth={1.5}
        />
      </summary>
      <div className="px-4 py-3">{children}</div>
    </details>
  )
}
