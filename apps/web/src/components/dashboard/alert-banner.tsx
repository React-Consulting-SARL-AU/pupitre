import { StatusDot } from "@/components/ui/status-dot"
import { type AlertCount, alertBannerLabel } from "@/lib/domain/alerts"

export interface AlertBannerProps {
  count: AlertCount
}

export function AlertBanner({ count }: AlertBannerProps) {
  if (count.alerts === 0) {
    return null
  }

  return (
    <div
      className="mb-gutter flex items-center gap-3 rounded-md bg-surface px-4 py-3 shadow-raised"
      data-testid="alert-banner"
      role="status"
    >
      <StatusDot label="Alertes actives" shape="barred" tone="danger" />
      <p className="text-[13px] text-ink">{alertBannerLabel(count)}</p>
      <p className="text-[13px] text-ink-3">
        Ouvrez la fiche du serveur concerné : le remède y est écrit.
      </p>
    </div>
  )
}
