import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { alertLook } from "@/lib/domain/alerts"
import { formatRelative } from "@/lib/utils/format"

export interface ServerAlert {
  kind: string
  first_seen_at: string
  notified_at: string | null
}

export interface ServerAlertsProps {
  alerts: ServerAlert[]
}

export function ServerAlerts({ alerts }: ServerAlertsProps) {
  const t = useTranslations()

  return (
    <Card data-testid="server-alerts">
      <CardHeader>
        <CardTitle>{t("servers.alerts.title")}</CardTitle>
        <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          {alerts.length === 0
            ? t("servers.alerts.none")
            : t.plural("servers.alerts.count", alerts.length)}
        </span>
      </CardHeader>
      {alerts.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">{t("servers.alerts.empty")}</p>
        </CardBody>
      ) : (
        <ul>
          {alerts.map((alert) => {
            const look = alertLook(alert.kind)

            return (
              <li
                className="flex gap-3 border-line border-b px-4 py-3 last:border-b-0"
                key={alert.kind}
              >
                <StatusDot
                  className="mt-[3px]"
                  label={t(look.label)}
                  shape={look.shape}
                  tone={look.tone}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{t(look.label)}</p>
                  <p className="mt-1 text-[13px] text-ink-2">{t(look.fix)}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[12px] text-ink-3">
                  {formatRelative(alert.first_seen_at, t)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
