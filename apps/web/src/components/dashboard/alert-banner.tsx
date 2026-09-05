import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import type { AlertCount } from "@/lib/domain/alerts"

export interface AlertBannerProps {
  count: AlertCount
}

export function AlertBanner({ count }: AlertBannerProps) {
  const t = useTranslations()

  if (count.alerts === 0) {
    return null
  }

  return (
    <div
      className="mb-gutter flex items-center gap-3 rounded-md bg-surface px-4 py-3 shadow-raised"
      data-testid="alert-banner"
      role="status"
    >
      <StatusDot
        label={t("servers.alerts.active")}
        shape="barred"
        tone="danger"
      />
      <p className="text-[13px] text-ink">
        {t.plural("alert.banner", count.alerts, {
          alerts: count.alerts,
          servers: t.plural("alert.banner.servers", count.servers),
        })}
      </p>
      <p className="text-[13px] text-ink-3">{t("servers.alerts.open")}</p>
    </div>
  )
}
