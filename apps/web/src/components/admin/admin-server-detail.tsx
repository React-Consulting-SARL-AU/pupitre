import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { RotateCcw } from "lucide-react"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminSuspendDialog } from "@/components/admin/admin-suspend-dialog"
import { ServerAlerts } from "@/components/dashboard/server-alerts"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  adminServerQueryOptions,
  restoreServer,
  suspendServer,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  canActOnPlatform,
  canRestore,
  canSuspend,
  suspendedReasonKey,
} from "@/lib/domain/admin"
import { statusLook } from "@/lib/domain/server-status"
import { formatDateTime, formatRatio, formatRelative } from "@/lib/utils/format"

export interface AdminServerDetailProps {
  id: string
}

export function AdminServerDetail({ id }: AdminServerDetailProps) {
  const t = useTranslations()
  const { platformRole } = useDashboardContext()
  const server = useQuery(adminServerQueryOptions(id))
  const touched = [queryKeys.admin.server(id), queryKeys.admin.allServers]

  const suspend = useOptimisticMutation<string>({
    mutationFn: (reason) => suspendServer(id, reason),
    invalidate: touched,
    toast: {
      failed: () => ({
        title: t("admin.servers.suspendFailed"),
        fix: t("admin.servers.suspendFailedFix"),
      }),
    },
  })
  const restore = useOptimisticMutation({
    mutationFn: () => restoreServer(id),
    invalidate: touched,
    toast: {
      failed: () => ({
        title: t("admin.servers.restoreFailed"),
        fix: t("admin.servers.restoreFailedFix"),
      }),
    },
  })

  if (server.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (server.isError) {
    return (
      <AdminFailure
        fetching={server.isFetching}
        onRetry={() => {
          server.refetch()
        }}
      />
    )
  }

  const detail = server.data
  const reason = suspendedReasonKey(detail.suspended_reason)
  const acts = canActOnPlatform(platformRole)
  const usage = detail.usage

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("serverPage.state")}</CardTitle>
          <div className="flex items-center gap-3">
            <StatusBadge look={statusLook(detail.status, detail.stale)} />
            {acts && canSuspend(detail.status) ? (
              <AdminSuspendDialog
                busy={suspend.isPending}
                onConfirm={(said) => {
                  suspend.mutate(said)
                }}
                server={detail}
              />
            ) : null}
            {acts && canRestore(detail.suspended_reason) ? (
              <Button
                icon={RotateCcw}
                loading={restore.isPending}
                onClick={() => {
                  restore.mutate(undefined)
                }}
                size="sm"
              >
                {t("admin.servers.restore")}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <AdminFacts
          facts={[
            {
              label: t("admin.servers.host"),
              value: detail.host ?? t("servers.unknownHost"),
            },
            { label: t("admin.servers.port"), value: detail.port },
            { label: t("admin.servers.sshUser"), value: detail.user },
            {
              label: t("admin.servers.suspendedReason.label"),
              value: reason ? t(reason) : t("format.none"),
            },
            {
              label: t("admin.servers.organization"),
              value: (
                <Link
                  className="underline-offset-2 hover:underline"
                  params={{ id: detail.organization.id }}
                  to="/dashboard/admin/organizations/$id"
                >
                  {detail.organization.name}
                </Link>
              ),
            },
            {
              label: t("admin.servers.assignedUser"),
              value: detail.assigned_user ? (
                <Link
                  className="underline-offset-2 hover:underline"
                  params={{ id: detail.assigned_user.id }}
                  to="/dashboard/admin/users/$id"
                >
                  {detail.assigned_user.email}
                </Link>
              ) : (
                t("admin.servers.unassigned")
              ),
            },
            {
              label: t("admin.servers.device"),
              value: detail.device?.name ?? t("format.none"),
            },
            {
              label: t("serverPage.agent"),
              value: `${detail.agent_version ?? t("format.none")} → ${detail.target_version ?? t("format.none")}`,
            },
            { label: t("admin.servers.channel"), value: detail.channel },
            {
              label: t("serverPage.lastHeartbeat"),
              value: formatRelative(detail.last_heartbeat_at, t),
            },
            {
              label: t("admin.servers.entitlementValidUntil"),
              value: detail.entitlement_valid_until
                ? formatDateTime(detail.entitlement_valid_until, t)
                : t("format.none"),
            },
            {
              label: t("admin.servers.usage"),
              value: usage
                ? `${formatRatio(usage.disk, t)} · ${formatRatio(usage.ram, t)} · ${usage.load}`
                : t("format.none"),
            },
          ]}
        />
      </Card>

      <ServerAlerts alerts={detail.alerts} />

      <AdminEventsCard
        events={detail.events.map((event) => ({
          ...event,
          actor: event.actor?.email ?? null,
        }))}
      />
    </div>
  )
}
