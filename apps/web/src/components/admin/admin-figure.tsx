import { Card } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { OverviewFigure } from "@/lib/domain/admin"

export interface AdminFigureProps {
  figure: OverviewFigure
}

export function AdminFigure({ figure }: AdminFigureProps) {
  const t = useTranslations()

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
        {t(figure.label)}
      </p>
      <p className="font-bold font-display text-[28px] text-ink tabular-nums leading-[1.2] tracking-[-0.01em]">
        {figure.value}
      </p>

      {figure.parts.length > 0 ? (
        <dl className="flex flex-col gap-1 border-line border-t pt-3">
          {figure.parts.map((part) => (
            <div
              className="flex items-baseline justify-between gap-4"
              key={part.label}
            >
              <dt className="text-[12px] text-ink-2">{t(part.label)}</dt>
              <dd className="font-data text-[12px] text-ink tabular-nums">
                {part.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  )
}
