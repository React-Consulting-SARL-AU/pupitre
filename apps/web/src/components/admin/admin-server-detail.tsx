import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Ban, RotateCcw, Trash2 } from "lucide-react"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminFailure } from "@/components/admin/admin-failure"
import { ServerAlerts } from "@/components/dashboard/server-alerts"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  adminServerQueryOptions,
  deleteServer,
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
import { purgeable, type ServerDeletion } from "@/lib/domain/server-deletion"
import { statusLook } from "@/lib/domain/server-status"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime, formatRatio, formatRelative } from "@/lib/utils/format"

export interface AdminServerDetailProps {
  id: string
}

interface Deletion {
  deletion: ServerDeletion
  reason: string
}

interface DeletableServer {
  name: string
  status: string
  decommission_at: string | null
  organization: { name: string }
}

interface DeletionCopy {
  label: string
  title: string
  description: string
  keyword: string | undefined
  deletion: ServerDeletion
}

/** Revoking and purging are the same control, one step apart: the copy says which one it is. */
function deletionCopy(server: DeletableServer, t: Translate): DeletionCopy {
  if (purgeable(server.status)) {
    return {
      label: t("admin.servers.purge"),
      title: t("admin.servers.purgeTitle"),
      description: t("admin.servers.purgeDescription", {
        name: server.name,
        date: server.decommission_at
          ? formatDateTime(server.decommission_at, t)
          : t("format.none"),
      }),
      keyword: server.name,
      deletion: "purge",
    }
  }

  return {
    label: t("admin.servers.delete"),
    title: t("admin.servers.deleteTitle"),
    description: t("admin.servers.deleteDescription", {
      name: server.name,
      organization: server.organization.name,
    }),
    keyword: undefined,
    deletion: "revoke",
  }
}

export function AdminServerDetail({ id }: AdminServerDetailProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const { platformRole } = useDashboardContext()
  const server = useQuery(adminServerQueryOptions(id))
  const serverName = server.data?.name ?? ""
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
  // The purge leaves the page at the click, as the owner's does: no line is left to look at.
  const remove = useOptimisticMutation<Deletion>({
    mutationFn: ({ reason }) => deleteServer(id, reason),
    invalidate: touched,
    onStart: ({ deletion }) => {
      if (deletion === "purge") {
        navigate({ to: "/dashboard/admin/servers" })
      }
    },
    toast: {
      done: (_data, { deletion }) =>
        t(
          deletion === "purge"
            ? "admin.servers.purged"
            : "admin.servers.deleted",
          { name: serverName }
        ),
      failed: ({ deletion }) => ({
        title: t("admin.servers.deleteFailed"),
        fix: t("admin.servers.deleteFailedFix"),
        ...(deletion === "purge"
          ? {
              action: {
                label: t("serverActions.reopen"),
                run: () => {
                  navigate({
                    to: "/dashboard/admin/servers/$id",
                    params: { id },
                  })
                },
              },
            }
          : {}),
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
  const deletion = deletionCopy(detail, t)

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("serverPage.state")}</CardTitle>
          <div className="flex items-center gap-3">
            <StatusBadge look={statusLook(detail.status, detail.stale)} />
            {acts && canSuspend(detail.status) ? (
              <ConfirmFormDialog
                busy={suspend.isPending}
                busyLabel={t("admin.servers.suspending")}
                confirmLabel={t("admin.servers.suspend")}
                description={t("admin.servers.suspendDescription", {
                  name: detail.name,
                  organization: detail.organization.name,
                })}
                id={`suspend-${detail.id}`}
                onConfirm={(values) => {
                  suspend.mutate(values.reason)
                }}
                reason="required"
                reasonLabel={t("admin.servers.reason")}
                title={t("admin.servers.suspendTitle")}
                triggerIcon={Ban}
                triggerLabel={t("admin.servers.suspend")}
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
            {acts ? (
              <ConfirmFormDialog
                busy={remove.isPending}
                busyLabel={t("admin.servers.deleting")}
                confirmLabel={deletion.label}
                description={deletion.description}
                id={`delete-${detail.id}`}
                keyword={deletion.keyword}
                onConfirm={(values) => {
                  remove.mutate({
                    deletion: deletion.deletion,
                    reason: values.reason,
                  })
                }}
                reason="required"
                reasonLabel={t("admin.servers.reason")}
                title={deletion.title}
                triggerIcon={Trash2}
                triggerLabel={deletion.label}
              />
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
            ...(detail.decommission_at
              ? [
                  {
                    label: t("admin.servers.decommissionAt"),
                    value: formatDateTime(detail.decommission_at, t),
                  },
                ]
              : []),
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
