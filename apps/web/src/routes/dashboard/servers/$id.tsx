import { ApiError } from "@pupitre/api/client"
import type { QueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { RotateCw } from "lucide-react"
import { ServerActions } from "@/components/dashboard/server-actions"
import { ServerAlerts } from "@/components/dashboard/server-alerts"
import { ServerAssignment } from "@/components/dashboard/server-assignment"
import { ServerBackups } from "@/components/dashboard/server-backups"
import { ServerDevices } from "@/components/dashboard/server-devices"
import { ServerEvents } from "@/components/dashboard/server-events"
import { ServerMetrics } from "@/components/dashboard/server-metrics"
import { ServerModules } from "@/components/dashboard/server-modules"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Facts } from "@/components/ui/facts"
import { PageHeader } from "@/components/ui/page-header"
import { RouteError, RouteNotFound } from "@/components/ui/route-error"
import { PageSkeleton, SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import { serverQueryOptions } from "@/lib/api/queries"
import { pageTitle, serverDocumentTitle } from "@/lib/domain/page-titles"
import { statusLook } from "@/lib/domain/server-status"
import { formatRelative } from "@/lib/utils/format"

const ROUTE_ID = "/dashboard/servers/$id"

const NOT_FOUND = 404

interface ServerTab {
  name: string
}

interface ServerTabContext {
  context: { queryClient: QueryClient }
  params: { id: string }
}

async function loadServerTab({
  context,
  params,
}: ServerTabContext): Promise<ServerTab> {
  try {
    const server = await context.queryClient.ensureQueryData(
      serverQueryOptions(params.id)
    )

    return { name: server.name }
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND) {
      throw notFound()
    }

    throw error
  }
}

export const Route = createFileRoute("/dashboard/servers/$id")({
  component: ServerPage,
  errorComponent: RouteError,
  head: ({ loaderData, match }) => ({
    meta: [
      { title: serverDocumentTitle(loaderData?.name, match.context.locale) },
    ],
  }),
  loader: loadServerTab,
  notFoundComponent: RouteNotFound,
  pendingComponent: ServerPending,
})

function ServerPending() {
  const t = useTranslations()
  const { title, parents } = pageTitle(ROUTE_ID)

  return <PageSkeleton parents={parents} shape="cards" title={t(title)} />
}

function ServerPage() {
  const t = useTranslations()
  const { id } = Route.useParams()
  const server = useQuery(serverQueryOptions(id))
  const { parents } = pageTitle(ROUTE_ID)

  if (server.isPending) {
    return <SkeletonCards />
  }

  if (server.isError) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={server.isFetching}
            onClick={() => {
              server.refetch()
            }}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
        fix={t("route.failedFix")}
        title={t("route.failed")}
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
          <ServerActions
            decommissionAt={detail.decommission_at}
            serverId={detail.id}
            serverName={detail.name}
            status={detail.status}
          />
        }
        description={`${detail.user}@${detail.host ?? t("servers.unknownHost")}:${detail.port}`}
        parents={parents}
        title={detail.name}
      />

      <div className="flex flex-col gap-gutter">
        <Card>
          <CardHeader>
            <CardTitle>{t("serverPage.state")}</CardTitle>
            <StatusBadge look={statusLook(detail.status, detail.stale)} />
          </CardHeader>
          <Facts
            facts={[
              {
                label: t("serverPage.agent"),
                value: (
                  <span className="font-data text-[12px] tabular-nums">
                    {detail.agent_version ?? t("format.none")}
                    {detail.target_version &&
                    detail.target_version !== detail.agent_version
                      ? ` → ${detail.target_version}`
                      : ""}
                  </span>
                ),
              },
              {
                label: t("serverPage.lastHeartbeat"),
                value: formatRelative(detail.last_heartbeat_at, t),
              },
              {
                label: t("serverPage.hostFingerprint"),
                value: (
                  <span className="block truncate font-data text-[12px] text-ink-2">
                    {detail.host_fingerprint ?? t("format.none")}
                  </span>
                ),
              },
            ]}
          />
        </Card>

        <ServerAlerts alerts={detail.alerts} />

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

        <ServerBackups beat={detail.backup} serverId={detail.id} />

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
