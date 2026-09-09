import { PageHeader } from "@/components/ui/page-header"
import { useTranslations } from "@/hooks/use-locale"
import type { Crumb } from "@/lib/domain/page-titles"
import { cn } from "@/lib/utils/cn"

export interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-breathe rounded-sm bg-raised", className)}
    />
  )
}

const DEFAULT_ROWS = 4

const CARDS = [0, 1, 2]

function rowIndexes(rows: number): number[] {
  return Array.from({ length: rows }, (_, index) => index)
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-6 border-line border-b px-4 py-5 last:border-b-0">
      <Skeleton className="h-4 min-w-0 flex-1" />
      <Skeleton className="h-4 w-36 shrink-0" />
      <Skeleton className="h-4 w-24 shrink-0" />
    </div>
  )
}

export interface SkeletonWaitProps {
  /** What is being read, for the screen reader. Defaults to the generic wait. */
  label?: string
}

export interface SkeletonListProps extends SkeletonWaitProps {
  rows?: number
}

export function SkeletonRows({
  rows = DEFAULT_ROWS,
  label,
}: SkeletonListProps) {
  const t = useTranslations()

  return (
    <div
      aria-busy="true"
      className="overflow-hidden rounded-md bg-surface shadow-raised"
      role="status"
    >
      <span className="sr-only">{label ?? t("common.loading")}</span>
      {rowIndexes(rows).map((row) => (
        <SkeletonRow key={row} />
      ))}
    </div>
  )
}

/** The rows of `SkeletonRows` without their frame, for a wait inside an existing card. */
export function SkeletonLines({ rows = 3, label }: SkeletonListProps) {
  const t = useTranslations()

  return (
    <div aria-busy="true" role="status">
      <span className="sr-only">{label ?? t("common.loading")}</span>
      {rowIndexes(rows).map((row) => (
        <SkeletonRow key={row} />
      ))}
    </div>
  )
}

export function SkeletonCards({ label }: SkeletonWaitProps) {
  const t = useTranslations()

  return (
    <div aria-busy="true" className="flex flex-col gap-gutter" role="status">
      <span className="sr-only">{label ?? t("common.loading")}</span>
      {CARDS.map((card) => (
        <Skeleton className="h-28 rounded-md" key={card} />
      ))}
    </div>
  )
}

export type PageSkeletonShape = "rows" | "cards"

export interface PageSkeletonProps {
  title: string
  parents?: Crumb[]
  description?: string
  shape: PageSkeletonShape
}

export function PageSkeleton({
  title,
  parents,
  description,
  shape,
}: PageSkeletonProps) {
  return (
    <>
      <PageHeader
        description={description}
        parents={parents}
        pending
        title={title}
      />
      {shape === "rows" ? <SkeletonRows /> : <SkeletonCards />}
    </>
  )
}
