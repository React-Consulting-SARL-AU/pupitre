import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Ban, ShieldCheck, ShieldOff } from "lucide-react"
import { AdminEventsCard } from "@/components/admin/admin-events-card"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminFailure } from "@/components/admin/admin-failure"
import { AdminGrantDialog } from "@/components/admin/admin-grant-dialog"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmFormDialog } from "@/components/ui/confirm-form-dialog"
import { SkeletonCards } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/ui/status-badge"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation"
import {
  adminUserQueryOptions,
  banUser,
  revokeDevice,
  unbanUser,
} from "@/lib/api/admin-queries"
import { apiFailure } from "@/lib/api/errors"
import { queryKeys } from "@/lib/api/queries"
import {
  accountIsProtected,
  canActOnPlatform,
  subscriptionIsLive,
  userLook,
} from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { roleKey } from "@/lib/domain/roles"
import { statusLook } from "@/lib/domain/server-status"
import { formatDateTime, formatRelative } from "@/lib/utils/format"

export interface AdminUserDetailProps {
  id: string
}

interface Revocation {
  deviceId: string
  name: string
  reason: string
}

export function AdminUserDetail({ id }: AdminUserDetailProps) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const { platformRole } = useDashboardContext()
  const user = useQuery(adminUserQueryOptions(id))
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.user(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.allUsers }),
    ])
  }
  const ban = useMutation({
    mutationFn: (reason: string) => banUser(id, reason),
    onSuccess: refresh,
  })
  const lift = useMutation({
    mutationFn: () => unbanUser(id),
    onSuccess: refresh,
  })
  const revoke = useOptimisticMutation<Revocation>({
    mutationFn: ({ deviceId, reason }) => revokeDevice(id, deviceId, reason),
    invalidate: [queryKeys.admin.user(id), queryKeys.admin.allServers],
    toast: {
      done: (_data, { name }) => t("admin.users.revoked", { name }),
      failed: () => ({
        title: t("admin.users.revokeFailed"),
        fix: t("admin.users.revokeFailedFix"),
      }),
    },
  })

  if (user.isPending) {
    return <SkeletonCards label={t("admin.reading")} />
  }

  if (user.isError) {
    return (
      <AdminFailure
        fetching={user.isFetching}
        onRetry={() => {
          user.refetch()
        }}
      />
    )
  }

  const detail = user.data
  const refused = apiFailure(ban.error) ?? apiFailure(lift.error)
  const protectedAccount = accountIsProtected(refused?.status)
  const manages = canActOnPlatform(platformRole)
  const acts = manages && detail.platform_role === null

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  return (
    <div className="flex flex-col gap-gutter">
      {refused ? (
        <Callout fix={refused.fix} title={refused.message} tone="danger" />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users.profile")}</CardTitle>
          <div className="flex items-center gap-3">
            <StatusBadge look={userLook(detail)} />
            {acts && !detail.banned ? (
              <ConfirmFormDialog
                busy={ban.isPending}
                busyLabel={t("admin.users.banning")}
                confirmLabel={t("admin.users.ban")}
                description={t("admin.users.banDescription", {
                  email: detail.email,
                })}
                id={`ban-${detail.id}`}
                onConfirm={(values) => {
                  ban.mutate(values.reason)
                }}
                reason="required"
                reasonLabel={t("admin.users.banReason")}
                reasonRequiredMessage={t("admin.users.banReasonRequired")}
                title={t("admin.users.banTitle")}
                triggerDisabled={protectedAccount}
                triggerIcon={Ban}
                triggerLabel={t("admin.users.ban")}
              />
            ) : null}
            {acts && detail.banned ? (
              <Button
                disabled={protectedAccount}
                icon={ShieldCheck}
                loading={lift.isPending}
                onClick={() => {
                  lift.mutate()
                }}
                size="sm"
              >
                {t("admin.users.unban")}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <AdminFacts
          facts={[
            { label: t("admin.users.email"), value: detail.email },
            { label: t("admin.users.name"), value: detail.name },
            {
              label: t("admin.users.createdAt"),
              value: formatDateTime(detail.created_at, t),
            },
            {
              label: t("admin.users.emailVerified"),
              value: detail.email_verified
                ? t("admin.users.active")
                : t("admin.users.unverified"),
            },
            {
              label: t("admin.users.platformRole"),
              value: detail.platform_role
                ? roleName(detail.platform_role)
                : t("admin.users.noRole"),
            },
            {
              label: t("admin.users.banReason"),
              value: detail.banned_reason ?? t("format.none"),
            },
            {
              label: t("admin.users.banExpires"),
              value: detail.ban_expires_at
                ? formatDateTime(detail.ban_expires_at, t)
                : t("admin.users.banForever"),
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users.organizations")}</CardTitle>
        </CardHeader>

        {detail.organizations.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.users.noOrganization")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.organizations.map((organization) => {
              const look = organization.subscription_status
                ? subscriptionStatusLook(organization.subscription_status)
                : null

              return (
                <li
                  className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                  key={organization.id}
                >
                  <Link
                    className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
                    params={{ id: organization.id }}
                    to="/dashboard/admin/organizations/$id"
                  >
                    {organization.name}
                  </Link>
                  <span className="text-[12px] text-ink-2 sm:w-24">
                    {roleName(organization.role)}
                  </span>
                  <span className="text-[12px] text-ink-2 sm:w-32">
                    {look ? t(look.label) : t("admin.users.noSubscription")}
                  </span>
                  <span className="font-data text-[12px] text-ink-3 tabular-nums sm:w-28 sm:text-right">
                    {t.plural("admin.users.servers", organization.servers)}
                  </span>
                  {manages ? (
                    <AdminGrantDialog
                      blocked={
                        organization.subscription_status
                          ? subscriptionIsLive(organization.subscription_status)
                          : false
                      }
                      onGranted={refresh}
                      organization={organization}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users.devices")}</CardTitle>
        </CardHeader>

        {detail.devices.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.users.noDevice")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.devices.map((device) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={device.id}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {device.name}
                </span>
                <span className="font-data text-[12px] text-ink-3 tabular-nums">
                  {formatRelative(device.last_used_at ?? null, t)}
                </span>
                {manages ? (
                  <ConfirmFormDialog
                    busy={
                      revoke.isPending &&
                      revoke.variables?.deviceId === device.id
                    }
                    busyLabel={t("admin.users.revoking")}
                    confirmLabel={t("admin.users.revokeDevice")}
                    description={t("admin.users.revokeDescription", {
                      name: device.name,
                    })}
                    id={`revoke-${device.id}`}
                    onConfirm={(values) => {
                      revoke.mutate({
                        deviceId: device.id,
                        name: device.name,
                        reason: values.reason,
                      })
                    }}
                    reason="required"
                    reasonLabel={t("admin.servers.reason")}
                    reasonRequiredMessage={t(
                      "admin.users.revokeReasonRequired"
                    )}
                    title={t("admin.users.revokeTitle")}
                    triggerIcon={ShieldOff}
                    triggerLabel={t("admin.users.revokeDevice")}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users.assignedServers")}</CardTitle>
        </CardHeader>

        {detail.assigned_servers.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("admin.users.noAssignedServer")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {detail.assigned_servers.map((server) => (
              <li
                className="flex flex-wrap items-center gap-4 border-line border-b px-4 py-3 last:border-b-0"
                key={server.id}
              >
                <Link
                  className="min-w-0 flex-1 truncate text-[13px] text-ink underline-offset-2 hover:underline"
                  params={{ id: server.id }}
                  to="/dashboard/admin/servers/$id"
                >
                  {server.name}
                </Link>
                <span className="truncate font-data text-[12px] text-ink-3 sm:w-48">
                  {server.host ?? t("servers.unknownHost")}
                </span>
                <span className="text-[12px] text-ink-2 sm:w-40">
                  {server.organization.name}
                </span>
                <StatusBadge look={statusLook(server.status)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AdminEventsCard
        events={detail.events.map((event) => ({
          ...event,
          actor: event.actor?.email ?? null,
        }))}
      />
    </div>
  )
}
