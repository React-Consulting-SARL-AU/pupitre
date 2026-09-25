import { Card } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { OverviewFigure } from "@/lib/domain/admin"

export interface AdminFigureProps {
  figure: OverviewFigure
}

/** One counter of the overview: what it counts, how many, and its breakdown underneath. */
export function AdminFigure({ figure }: AdminFigureProps) {
  const t = useTranslations()

  return (
    <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <p className="truncate text-label">{t(figure.label)}</p>
      <p className="font-bold font-display text-[24px] text-ink tabular-nums leading-[1.2] tracking-[-0.01em]">
        {figure.value}
      </p>
      {figure.parts.length > 0 ? (
        <p className="font-data text-[12px] text-ink-3 tabular-nums leading-[1.5]">
          {figure.parts
            .map((part) => `${part.value} ${t(part.label).toLowerCase()}`)
            .join(" · ")}
        </p>
      ) : null}
    </Card>
  )
}
