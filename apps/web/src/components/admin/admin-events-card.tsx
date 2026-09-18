import { AuditRow } from "@/components/dashboard/audit-row"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"

export interface AdminEventLine {
  id: string
  action: string
  target_type: string
  target_id: string
  created_at: string
  actor: string | null
}

export interface AdminEventsCardProps {
  events: AdminEventLine[]
}

/** The tail of a platform page: the last things that happened to what the page shows. */
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
            <AuditRow actor={event.actor} event={event} key={event.id} />
          ))}
        </ul>
      )}
    </Card>
  )
}
