import { useTranslations } from "@/hooks/use-locale"
import { cn } from "@/lib/utils/cn"
import { formatRatio } from "@/lib/utils/format"

const WARN_THRESHOLD = 80
const DANGER_THRESHOLD = 90

export interface UsageBarProps {
  label: string
  percent: number | null
  className?: string
}

function tone(percent: number): string {
  if (percent >= DANGER_THRESHOLD) {
    return "bg-danger"
  }

  if (percent >= WARN_THRESHOLD) {
    return "bg-warn"
  }

  return "bg-ink-2"
}

export function UsageBar({ label, percent, className }: UsageBarProps) {
  const t = useTranslations()
  const value = percent === null ? null : Math.max(0, Math.min(100, percent))
  const reading = value === null ? null : formatRatio(value / 100, t)

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="w-14 shrink-0 text-label">{label}</span>
      <span
        aria-label={
          reading === null
            ? t("servers.usage.unknown", { label })
            : t("servers.usage.value", { label, percent: reading })
        }
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={value ?? undefined}
        className="h-[6px] w-24 shrink-0 overflow-hidden rounded-full bg-raised"
        role="progressbar"
      >
        {value === null ? null : (
          <span
            className={cn("block h-full rounded-full", tone(value))}
            style={{ width: `${value}%` }}
          />
        )}
      </span>
      <span className="w-11 shrink-0 whitespace-nowrap text-right font-data text-[12px] text-ink-2 tabular-nums">
        {reading ?? t("format.none")}
      </span>
    </div>
  )
}
