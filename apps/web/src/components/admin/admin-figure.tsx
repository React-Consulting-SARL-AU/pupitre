import { useTranslations } from "@/hooks/use-locale"
import type { OverviewFigure } from "@/lib/domain/admin"

export interface AdminFigureProps {
  figure: OverviewFigure
}

/** One counter of the band: what it counts, how many, and its breakdown on one line. */
export function AdminFigure({ figure }: AdminFigureProps) {
  const t = useTranslations()

  return (
    <div className="min-w-0 border-line border-r px-4 py-3 last:border-r-0">
      <p className="truncate text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
        {t(figure.label)}
      </p>
      <p className="font-bold font-display text-[22px] text-ink tabular-nums leading-[1.2] tracking-[-0.01em]">
        {figure.value}
      </p>
      {figure.parts.length > 0 ? (
        <p className="truncate font-data text-[12px] text-ink-3 tabular-nums">
          {figure.parts
            .map((part) => `${part.value} ${t(part.label).toLowerCase()}`)
            .join(" · ")}
        </p>
      ) : null}
    </div>
  )
}
