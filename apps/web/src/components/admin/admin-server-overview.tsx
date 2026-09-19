import { RELEASE_CHANNELS, type ReleaseChannel } from "@pupitre/shared/releases"
import { Link } from "@tanstack/react-router"
import { AdminFacts } from "@/components/admin/admin-facts"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  type AdminServerDetail,
  setServerChannel,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import { channelKey, suspendedReasonKey } from "@/lib/domain/admin"
import { statusLook } from "@/lib/domain/server-status"
import type { Translate } from "@/lib/i18n/i18n"
import { formatDateTime, formatRatio, formatRelative } from "@/lib/utils/format"

export interface AdminServerOverviewProps {
  server: AdminServerDetail
  canAct: boolean
}

function channelName(channel: string, t: Translate): string {
  const key = channelKey(channel)

  return key ? t(key) : channel
}

function toChannel(value: string): ReleaseChannel {
  return RELEASE_CHANNELS.find((candidate) => candidate === value) ?? "stable"
}

export function AdminServerOverview({
  server,
  canAct,
}: AdminServerOverviewProps) {
  const t = useTranslations()
  const channel = useOptimisticMutation<ReleaseChannel>({
    mutationFn: (next) => setServerChannel(server.id, next),
    invalidate: [queryKeys.admin.server(server.id), queryKeys.admin.allServers],
    toast: {
      done: (_data, next) =>
        t("admin.servers.channelApplied", {
          name: server.name,
          channel: channelName(next, t),
        }),
      failed: () => ({
        title: t("admin.servers.channelFailed"),
        fix: t("admin.servers.channelFailedFix"),
      }),
    },
  })
  const reason = suspendedReasonKey(server.suspended_reason)
  const usage = server.usage

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("serverPage.state")}</CardTitle>
          <div className="flex items-center gap-3">
            <StatusBadge look={statusLook(server.status)} />
            {server.stale ? (
              <StatusBadge look={statusLook(server.status, true)} />
            ) : null}
          </div>
        </CardHeader>

        <AdminFacts
          facts={[
            {
              label: t("admin.servers.host"),
              value: server.host ?? t("servers.unknownHost"),
            },
            { label: t("admin.servers.port"), value: server.port },
            { label: t("admin.servers.sshUser"), value: server.user },
            {
              label: t("admin.servers.suspendedReason.label"),
              value: reason ? t(reason) : t("format.none"),
            },
            {
              label: t("admin.servers.entitlementValidUntil"),
              value: server.entitlement_valid_until
                ? formatDateTime(server.entitlement_valid_until, t)
                : t("format.none"),
            },
            {
              label: t("admin.servers.organization"),
              value: (
                <Link
                  className="underline-offset-2 hover:underline"
                  params={{ id: server.organization.id }}
                  to="/dashboard/admin/organizations/$id"
                >
                  {server.organization.name}
                </Link>
              ),
            },
            {
              label: t("admin.servers.assignedUser"),
              value: server.assigned_user ? (
                <Link
                  className="underline-offset-2 hover:underline"
                  params={{ id: server.assigned_user.id }}
                  to="/dashboard/admin/users/$id"
                >
                  {server.assigned_user.email}
                </Link>
              ) : (
                t("admin.servers.unassigned")
              ),
            },
            {
              label: t("admin.servers.pendingAssignment"),
              value: server.pending_assignment_email ?? t("format.none"),
            },
            {
              label: t("admin.servers.device"),
              value: server.device?.name ?? t("format.none"),
            },
            {
              label: t("admin.servers.deviceOwner"),
              value: server.device?.user.email ?? t("format.none"),
            },
            {
              label: t("serverPage.agent"),
              value: `${server.agent_version ?? t("format.none")} → ${server.target_version ?? t("format.none")}`,
            },
            ...(canAct
              ? []
              : [
                  {
                    label: t("admin.servers.channel"),
                    value: channelName(server.channel, t),
                  },
                ]),
            {
              label: t("admin.servers.heartbeat"),
              value: formatRelative(server.last_heartbeat_at, t),
            },
            {
              label: t("admin.servers.usage"),
              value: usage
                ? `${formatRatio(usage.disk, t)} · ${formatRatio(usage.ram, t)} · ${usage.load}`
                : t("format.none"),
            },
            ...(server.enrollment_expires_at
              ? [
                  {
                    label: t("admin.servers.enrollmentExpiresAt"),
                    value: formatDateTime(server.enrollment_expires_at, t),
                  },
                ]
              : []),
            ...(server.decommission_at
              ? [
                  {
                    label: t("admin.servers.decommissionAt"),
                    value: formatDateTime(server.decommission_at, t),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {canAct ? (
        <Card>
          <CardBody className="flex flex-col gap-2">
            <Label htmlFor={`channel-${server.id}`}>
              {t("admin.servers.setChannel")}
            </Label>
            <Select
              className="w-48"
              disabled={channel.isPending}
              id={`channel-${server.id}`}
              items={RELEASE_CHANNELS.map((candidate) => ({
                value: candidate,
                label: channelName(candidate, t),
              }))}
              onValueChange={(next) => {
                channel.mutate(toChannel(next))
              }}
              value={server.channel}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
