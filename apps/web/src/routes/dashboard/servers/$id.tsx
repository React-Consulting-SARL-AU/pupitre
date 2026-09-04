import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ServerActions } from "@/components/dashboard/server-actions"
import { ServerAssignment } from "@/components/dashboard/server-assignment"
import { ServerDevices } from "@/components/dashboard/server-devices"
import { ServerEvents } from "@/components/dashboard/server-events"
import { ServerMetrics } from "@/components/dashboard/server-metrics"
import { ServerModules } from "@/components/dashboard/server-modules"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { serverQueryOptions } from "@/lib/api/queries"
import { pageTitle } from "@/lib/domain/page-titles"
import { statusLook } from "@/lib/domain/server-status"
import { formatRelative } from "@/lib/utils/format"

export const Route = createFileRoute("/dashboard/servers/$id")({
  component: ServerPage,
})

function ServerPage() {
  const { id } = Route.useParams()
  const server = useQuery(serverQueryOptions(id))
  const { parents } = pageTitle("/dashboard/servers/$id")

  if (server.isPending) {
    return <LoadingState label="Lecture du serveur…" />
  }

  if (server.isError) {
    return (
      <Callout
        fix="Retournez à la liste des serveurs."
        title="Ce serveur est introuvable dans l'organisation active."
        tone="danger"
      />
    )
  }

  const detail = server.data
  const last = detail.metrics.at(-1) ?? null

  return (
    <>
      <PageHeader
        actions={
          <ServerActions serverId={detail.id} serverName={detail.name} />
        }
        description={`${detail.user}@${detail.host ?? "hôte inconnu"}:${detail.port}`}
        parents={parents}
        title={detail.name}
      />

      <div className="flex flex-col gap-gutter">
        <Card>
          <CardHeader>
            <CardTitle>État</CardTitle>
            <StatusBadge look={statusLook(detail.status, detail.stale)} />
          </CardHeader>
          <CardBody className="grid gap-gutter sm:grid-cols-3">
            <div>
              <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                Agent
              </p>
              <p className="font-data text-[12px] text-ink tabular-nums">
                {detail.agent_version ?? "—"}
                {detail.target_version &&
                detail.target_version !== detail.agent_version
                  ? ` → ${detail.target_version}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                Dernier heartbeat
              </p>
              <p className="text-[13px] text-ink">
                {formatRelative(detail.last_heartbeat_at)}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                Empreinte d'hôte
              </p>
              <p className="truncate font-data text-[12px] text-ink-2">
                {detail.host_fingerprint ?? "—"}
              </p>
            </div>
          </CardBody>
        </Card>

        <ServerAssignment
          assignedUserId={detail.assigned_user_id}
          pendingAssignmentEmail={detail.pending_assignment_email}
          serverId={detail.id}
          serverName={detail.name}
        />

        <ServerMetrics samples={detail.metrics} />

        <ServerModules
          modules={last?.modules ?? []}
          stackVersion={last?.stack_version ?? null}
        />

        <ServerDevices
          assignedUserId={detail.assigned_user_id}
          serverId={detail.id}
          serverName={detail.name}
        />

        <ServerEvents events={detail.events} />
      </div>
    </>
  )
}
