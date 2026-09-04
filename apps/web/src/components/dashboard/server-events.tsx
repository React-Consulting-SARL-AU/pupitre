import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/utils/format"

export interface ServerEvent {
  id: string
  action: string
  actor_user_id: string | null
  created_at: string
}

export interface ServerEventsProps {
  events: ServerEvent[]
}

export function ServerEvents({ events }: ServerEventsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal</CardTitle>
      </CardHeader>
      {events.length === 0 ? (
        <CardBody>
          <p className="text-[13px] text-ink-3">
            Aucun événement pour l'instant.
          </p>
        </CardBody>
      ) : (
        <ul>
          {events.map((event) => (
            <li
              className="flex items-baseline justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0"
              key={event.id}
            >
              <span className="font-data text-[12px] text-ink">
                {event.action}
              </span>
              <span className="font-data text-[12px] text-ink-3 tabular-nums">
                {formatDateTime(event.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
