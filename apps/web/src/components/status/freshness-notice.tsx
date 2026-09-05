import type { StatusFreshness } from "@pupitre/shared/status"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { freshnessNotice } from "@/lib/domain/service-status"

export interface FreshnessNoticeProps {
  freshness: StatusFreshness
  lastObservationAt: string | null
  now?: Date
}

export function FreshnessNotice({
  freshness,
  lastObservationAt,
  now,
}: FreshnessNoticeProps) {
  const t = useTranslations()
  const notice = freshnessNotice(freshness, lastObservationAt, t, now)

  if (!notice) {
    return null
  }

  return (
    <div
      className="mb-gutter flex items-start gap-3 rounded-md bg-surface px-4 py-3 shadow-raised"
      data-freshness={freshness}
      data-testid="freshness-notice"
      role="status"
    >
      <span className="pt-1">
        <StatusDot
          label={t(notice.look.label)}
          shape={notice.look.shape}
          tone={notice.look.tone}
        />
      </span>
      <div>
        <p className="text-[13px] text-ink">{notice.headline}</p>
        <p className="mt-1 text-[13px] text-ink-3">{notice.detail}</p>
      </div>
    </div>
  )
}
