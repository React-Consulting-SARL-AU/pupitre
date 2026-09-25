import { AuditRow, type AuditRowEvent } from "@/components/dashboard/audit-row"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

export interface AdminEventsCardProps {
  events: readonly AuditRowEvent[]
}

export function AdminEventsCard({ events }: AdminEventsCardProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.events.recent")}</CardTitle>
      </CardHeader>

      {events.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">{t("admin.events.empty")}</p>
        </CardBody>
      ) : (
        <ul>
          {events.map((event) => (
            <AuditRow event={event} key={event.id} />
          ))}
        </ul>
      )}
    </Card>
  )
}
