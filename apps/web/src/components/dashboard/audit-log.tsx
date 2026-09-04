import { useQuery } from "@tanstack/react-query"
import { ScrollText } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { eventsQueryOptions } from "@/lib/api/queries"
import {
  AUDIT_ACTIONS,
  actionLabel,
  EVENTS_PER_PAGE,
  targetLabel,
} from "@/lib/domain/audit"
import { formatDateTime } from "@/lib/utils/format"

const ALL_ACTIONS = ""

export function AuditLog() {
  const { activeOrganization } = useDashboardContext()
  const [action, setAction] = useState(ALL_ACTIONS)
  const [offset, setOffset] = useState(0)
  const organizationId = activeOrganization?.id ?? ""
  const page = useQuery({
    ...eventsQueryOptions(organizationId, {
      limit: EVENTS_PER_PAGE,
      offset,
      ...(action === ALL_ACTIONS ? {} : { action }),
    }),
    enabled: organizationId !== "",
  })

  function filterOn(next: string) {
    setAction(next)
    setOffset(0)
  }

  if (!activeOrganization) {
    return (
      <Callout
        fix="Choisissez une organisation dans le sélecteur de la barre latérale."
        title="Aucune organisation active."
      />
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="audit-action">Action</Label>
          <select
            className="h-9 rounded-sm border border-line-strong bg-sunken px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
            id="audit-action"
            onChange={(event) => {
              filterOn(event.target.value)
            }}
            value={action}
          >
            <option value={ALL_ACTIONS}>Toutes les actions</option>
            {AUDIT_ACTIONS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {actionLabel(candidate)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {page.isPending ? <LoadingState label="Lecture du journal…" /> : null}

      {page.isError ? (
        <Callout
          fix="Le journal est réservé aux administrateurs de l'organisation."
          title="Le journal n'a pas pu être lu."
          tone="danger"
        />
      ) : null}

      {page.isSuccess && page.data.total === 0 ? (
        <EmptyState
          description="Chaque enrôlement, attribution, révocation et changement d'abonnement viendra s'inscrire ici, avec son auteur et son horodatage."
          icon={ScrollText}
          title="Rien dans le journal pour l'instant"
        />
      ) : null}

      {page.isSuccess && page.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Journal</CardTitle>
            <span className="font-data text-[12px] text-ink-3 tabular-nums">
              {offset + 1}–{offset + page.data.data.length} sur{" "}
              {page.data.total}
            </span>
          </CardHeader>

          <ul>
            {page.data.data.map((event) => (
              <li
                className="flex flex-wrap items-baseline justify-between gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={event.id}
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    {actionLabel(event.action)}
                  </p>
                  <p className="truncate font-data text-[12px] text-ink-3">
                    {targetLabel(event.target_type)} · {event.target_id}
                  </p>
                </div>
                <div className="text-right">
                  <p className="truncate font-data text-[12px] text-ink-2">
                    {event.actor_email ?? "Pupitre"}
                  </p>
                  <p className="font-data text-[12px] text-ink-3 tabular-nums">
                    {formatDateTime(event.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {page.isSuccess && page.data.total > EVENTS_PER_PAGE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - EVENTS_PER_PAGE))
            }}
            size="sm"
          >
            Plus récent
          </Button>
          <Button
            disabled={offset + EVENTS_PER_PAGE >= page.data.total}
            onClick={() => {
              setOffset(offset + EVENTS_PER_PAGE)
            }}
            size="sm"
          >
            Plus ancien
          </Button>
        </div>
      ) : null}
    </div>
  )
}
