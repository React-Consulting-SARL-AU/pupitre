import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { InvitationRow } from "@/components/dashboard/invitation-row"
import { InviteForm } from "@/components/dashboard/invite-form"
import { MemberRow } from "@/components/dashboard/member-row"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingState } from "@/components/ui/loading-state"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import { membersQueryOptions } from "@/lib/api/queries"
import { cancelInvitation, removeMember } from "@/lib/auth/organization"

export function MemberList() {
  const t = useTranslations()
  const { user, activeOrganization } = useDashboardContext()
  const canInvite = usePermission("members:invite")
  const canManage = usePermission("members:manage")
  const organizationId = activeOrganization?.id ?? ""
  const members = useQuery({
    ...membersQueryOptions(organizationId),
    enabled: organizationId !== "",
  })
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(organizationId, memberId),
    onSuccess: () => queryClient.invalidateQueries(),
  })
  const cancel = useMutation({
    mutationFn: cancelInvitation,
    onSuccess: () => queryClient.invalidateQueries(),
  })

  if (!activeOrganization) {
    return (
      <Callout
        fix={t("auditUi.noOrganizationFix")}
        title={t("auditUi.noOrganization")}
      />
    )
  }

  if (members.isPending) {
    return <LoadingState label={t("memberList.reading")} />
  }

  if (members.isError) {
    return (
      <Callout
        fix={t("memberList.failedFix")}
        title={t("memberList.failed")}
        tone="danger"
      />
    )
  }

  const { members: people, invitations } = members.data

  return (
    <div className="flex flex-col gap-gutter">
      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("memberList.invite")}</CardTitle>
          </CardHeader>
          <CardBody>
            <InviteForm organizationId={organizationId} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("memberList.members")}</CardTitle>
          <span className="font-data text-[12px] text-ink-3 tabular-nums">
            {people.length}
          </span>
        </CardHeader>

        {remove.isError ? (
          <Callout
            className="m-4"
            fix={t("memberList.removeFailedFix")}
            title={t("memberList.removeFailed")}
            tone="danger"
          />
        ) : null}

        <ul>
          {people.map((member) => (
            <MemberRow
              isSelf={member.user_id === user.id}
              key={member.id}
              member={member}
              onRemove={(memberId) => {
                remove.mutate(memberId)
              }}
              pending={remove.isPending}
              removable={
                canManage &&
                member.user_id !== user.id &&
                member.role !== "owner"
              }
            />
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("memberList.invitations")}</CardTitle>
          <span className="font-data text-[12px] text-ink-3 tabular-nums">
            {invitations.length}
          </span>
        </CardHeader>

        {cancel.isError ? (
          <Callout
            className="m-4"
            fix={t("memberList.cancelFailedFix")}
            title={t("memberList.cancelFailed")}
            tone="danger"
          />
        ) : null}

        {invitations.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-ink-3">
              {t("memberList.noInvitation")}
            </p>
          </CardBody>
        ) : (
          <ul>
            {invitations.map((invitation) => (
              <InvitationRow
                cancellable={canManage}
                invitation={invitation}
                key={invitation.id}
                onCancel={(invitationId) => {
                  cancel.mutate(invitationId)
                }}
                pending={cancel.isPending}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
