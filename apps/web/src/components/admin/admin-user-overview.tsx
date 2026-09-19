import { Link } from "@tanstack/react-router"
import { MailCheck } from "lucide-react"
import type { AdminFact } from "@/components/admin/admin-facts"
import { AdminFacts } from "@/components/admin/admin-facts"
import { AdminGrantDialog } from "@/components/admin/admin-grant-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { useConfirmMutation } from "@/hooks/use-confirm-mutation"
import { useTranslations } from "@/hooks/use-locale"
import {
  type AdminUserDetail,
  resendUserVerification,
} from "@/lib/api/admin-queries"
import { queryKeys } from "@/lib/api/queries"
import {
  accountLook,
  accountReason,
  subscriptionIsLive,
} from "@/lib/domain/admin"
import { subscriptionStatusLook } from "@/lib/domain/billing"
import { roleKey } from "@/lib/domain/roles"
import { formatDateTime, formatRelative } from "@/lib/utils/format"

export interface AdminUserOverviewProps {
  detail: AdminUserDetail
  acts: boolean
  onGranted: () => Promise<void> | void
}

export function AdminUserOverview({
  detail,
  acts,
  onGranted,
}: AdminUserOverviewProps) {
  const t = useTranslations()
  const verification = useConfirmMutation({
    mutationFn: () => resendUserVerification(detail.id),
    invalidate: [queryKeys.admin.user(detail.id)],
    done: () =>
      t("admin.users.resendVerificationDone", { email: detail.email }),
    failed: {
      title: t("admin.users.resendVerificationFailed"),
      fix: t("admin.users.resendVerificationFailedFix"),
    },
  })
  const reason = accountReason(detail)

  function roleName(role: string): string {
    const key = roleKey(role)

    return key ? t(key) : role
  }

  const facts: AdminFact[] = [
    { label: t("admin.users.email"), value: detail.email },
    { label: t("admin.users.name"), value: detail.name || t("format.none") },
    {
      label: t("admin.users.createdAt"),
      value: formatDateTime(detail.created_at, t),
    },
    {
      label: t("admin.users.emailVerified"),
      value: detail.email_verified ? (
        t("admin.users.active")
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          {t("admin.users.unverified")}
          {acts ? (
            <Button
              icon={MailCheck}
              loading={verification.busy}
              onClick={() => {
                verification.run()
              }}
              size="sm"
            >
              {verification.busy
                ? t("admin.users.resendingVerification")
                : t("admin.users.resendVerification")}
            </Button>
          ) : null}
        </span>
      ),
    },
    {
      label: t("admin.users.platformRole"),
      value: detail.platform_role
        ? roleName(detail.platform_role)
        : t("admin.users.noRole"),
    },
    {
      label: t("admin.users.sessions"),
      value: detail.sessions,
    },
    {
      label: t("admin.users.lastSeen"),
      value: formatRelative(detail.last_seen_at, t),
    },
  ]

  if (reason) {
    facts.push({ label: t("admin.users.stateReason"), value: reason })
  }

  if (detail.state === "suspended") {
    facts.push({
      label: t("admin.users.suspendedUntil"),
      value: detail.ban_expires_at
        ? formatDateTime(detail.ban_expires_at, t)
        : t("admin.users.suspendedForever"),
    })
  }

  if (detail.deactivated_at) {
    facts.push({
      label: t("admin.users.deactivatedAt"),
      value: formatDateTime(detail.deactivated_at, t),
    })
  }

  if (detail.deletion_at) {
    facts.push({
      label: t("admin.users.deletionAt"),
      value: formatDateTime(detail.deletion_at, t),
    })
  }

  return (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users.profile")}</CardTitle>
          <StatusBadge look={accountLook(detail.state)} />
        </CardHeader>

        <AdminFacts facts={facts} />
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
                  {acts ? (
                    <AdminGrantDialog
                      blocked={
                        organization.subscription_status
                          ? subscriptionIsLive(organization.subscription_status)
                          : false
                      }
                      onGranted={onGranted}
                      organization={organization}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
