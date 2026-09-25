import { useQuery } from "@tanstack/react-query"
import { RotateCw } from "lucide-react"
import { InvitationRow } from "@/components/dashboard/invitation-row"
import { InviteForm } from "@/components/dashboard/invite-form"
import { MemberRow } from "@/components/dashboard/member-row"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonCards } from "@/components/ui/skeleton"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { usePermission } from "@/hooks/use-permission"
import { membersQueryOptions, queryKeys, type Roster } from "@/lib/api/queries"
import { cancelInvitation, removeMember } from "@/lib/auth/organization"

interface Target {
  id: string
  email: string
}

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
  const roster = queryKeys.members(organizationId)

  const remove = useOptimisticMutation<Target, void>({
    mutationFn: ({ id }) => removeMember(organizationId, id),
    patch: [
      patchQuery<Roster, Target>(roster, (previous, target) => ({
        ...previous,
        members: previous.members.filter((member) => member.id !== target.id),
      })),
    ],
    invalidate: [roster],
    toast: {
      done: (_data, target) => t("memberList.removed", { email: target.email }),
      failed: () => ({
        title: t("memberList.removeFailed"),
        fix: t("memberList.removeFailedFix"),
      }),
    },
  })

  const cancel = useOptimisticMutation<Target, void>({
    mutationFn: ({ id }) => cancelInvitation(id),
    patch: [
      patchQuery<Roster, Target>(roster, (previous, target) => ({
        ...previous,
        invitations: previous.invitations.filter(
          (invitation) => invitation.id !== target.id
        ),
      })),
    ],
    invalidate: [roster],
    toast: {
      done: (_data, target) =>
        t("memberList.cancelled", { email: target.email }),
      failed: () => ({
        title: t("memberList.cancelFailed"),
        fix: t("common.retryLater"),
      }),
    },
  })
  const removing = remove.isPending ? remove.variables?.id : undefined
  const cancelling = cancel.isPending ? cancel.variables?.id : undefined

  if (!activeOrganization) {
    return (
      <Callout
        fix={t("auditUi.noOrganizationFix")}
        title={t("auditUi.noOrganization")}
      />
    )
  }

  if (members.isPending) {
    return <SkeletonCards />
  }

  if (members.isError) {
    return (
      <Callout
        action={
          <Button
            icon={RotateCw}
            loading={members.isFetching}
            onClick={() => {
              members.refetch()
            }}
            size="sm"
          >
            {t("common.retry")}
          </Button>
        }
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

        <ul>
          {people.map((member) => (
            <MemberRow
              isSelf={member.user_id === user.id}
              key={member.id}
              member={member}
              onRemove={() => {
                remove.mutate({ id: member.id, email: member.email })
              }}
              removable={
                canManage &&
                member.user_id !== user.id &&
                member.role !== "owner"
              }
              removing={removing === member.id}
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
                cancelling={cancelling === invitation.id}
                invitation={invitation}
                key={invitation.id}
                onCancel={() => {
                  cancel.mutate({ id: invitation.id, email: invitation.email })
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
