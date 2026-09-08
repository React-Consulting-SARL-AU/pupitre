import { useQuery } from "@tanstack/react-query"
import { Mail, UserCheck } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { StatusDot } from "@/components/ui/status-dot"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import {
  patchQuery,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation"
import { usePermission } from "@/hooks/use-permission"
import {
  type AssignServerInput,
  assignServer,
  membersQueryOptions,
  queryKeys,
  type ServerDetail,
  unassignServer,
} from "@/lib/api/queries"
import { roleKey } from "@/lib/domain/roles"
import {
  type AssignByEmailInput,
  type AssignByEmailValues,
  assignByEmailSchema,
} from "@/lib/schemas/members"

export interface ServerAssignmentProps {
  serverId: string
  serverName: string
  assignedUserId: string | null
  pendingAssignmentEmail: string | null
}

const NOBODY = ""

export function ServerAssignment({
  serverId,
  serverName,
  assignedUserId,
  pendingAssignmentEmail,
}: ServerAssignmentProps) {
  const t = useTranslations()
  const { activeOrganization, user } = useDashboardContext()
  const canAssign = usePermission("servers:assign")
  const organizationId = activeOrganization?.id ?? ""
  const members = useQuery({
    ...membersQueryOptions(organizationId),
    enabled: canAssign && organizationId !== "",
  })
  const [choice, setChoice] = useState(NOBODY)
  const form = useForm<AssignByEmailInput, AssignByEmailValues>({
    schema: assignByEmailSchema(t),
    defaultValues: { email: "" },
  })
  const detail = queryKeys.server(serverId)
  const roster = members.data?.members ?? []

  function nameOf(userId: string): string {
    const member = roster.find((candidate) => candidate.user_id === userId)

    return member?.email ?? t("assign.themFallback")
  }

  const assign = useOptimisticMutation<AssignServerInput, void>({
    mutationFn: (input) => assignServer(serverId, input),
    patch: [
      patchQuery<ServerDetail, AssignServerInput>(detail, (server, input) => ({
        ...server,
        assigned_user_id: "user_id" in input ? input.user_id : null,
        pending_assignment_email:
          "invite_email" in input ? input.invite_email : null,
      })),
    ],
    invalidate: [detail, queryKeys.servers, queryKeys.members(organizationId)],
    onDone: () => {
      form.reset({ email: "" })
      setChoice(NOBODY)
    },
    toast: {
      done: (_data, input) =>
        "user_id" in input
          ? t("assign.done", { who: nameOf(input.user_id) })
          : t("assign.invitedDone", { email: input.invite_email }),
      failed: () => ({
        title: t("assign.failed"),
        fix: t("assign.failedFix"),
      }),
    },
  })

  const unassign = useOptimisticMutation({
    mutationFn: () => unassignServer(serverId),
    patch: [
      patchQuery<ServerDetail>(detail, (server) => ({
        ...server,
        assigned_user_id: null,
        pending_assignment_email: null,
      })),
    ],
    invalidate: [detail, queryKeys.servers],
    toast: {
      done: () => t("assign.removed"),
      failed: () => ({
        title: t("assign.removeFailed"),
        fix: t("assign.removeFailedFix"),
      }),
    },
  })

  const assignee = roster.find((member) => member.user_id === assignedUserId)
  const assignedToViewer = assignedUserId === user.id

  const submitEmail = form.handleSubmit((values) => {
    assign.mutate({ invite_email: values.email })
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assign.title")}</CardTitle>
        {assignedUserId ? (
          <span className="inline-flex items-center gap-2">
            <StatusDot label={t("assign.assigned")} shape="filled" tone="ok" />
            <span className="text-[13px] text-ink-2">
              {t("assign.assigned")}
            </span>
          </span>
        ) : null}
        {pendingAssignmentEmail ? (
          <span className="inline-flex items-center gap-2">
            <StatusDot
              label={t("assign.pendingLabel")}
              shape="breathing"
              tone="muted"
            />
            <span className="text-[13px] text-ink-2">
              {t("assign.pending")}
            </span>
          </span>
        ) : null}
      </CardHeader>

      <CardBody
        aria-busy={assign.isPending || unassign.isPending || undefined}
        className="flex flex-col gap-gutter"
      >
        <p className="text-[13px] text-ink-2">
          {assignedUserId && assignedToViewer ? t("assign.yours") : null}
          {assignedUserId && !assignedToViewer
            ? t("assign.theirs", {
                who: assignee?.email ?? t("assign.themFallback"),
              })
            : null}
          {pendingAssignmentEmail
            ? t("assign.invited", { email: pendingAssignmentEmail })
            : null}
          {assignedUserId || pendingAssignmentEmail ? null : t("assign.nobody")}
        </p>

        {assignedUserId && assignee ? (
          <div className="flex items-center justify-between gap-4 rounded-sm bg-sunken px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-ink">{assignee.name}</p>
              <p className="truncate font-data text-[12px] text-ink-3">
                {assignee.email}
              </p>
            </div>
            <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
              {t(roleKey(assignee.role) ?? "role.member")}
            </span>
          </div>
        ) : null}

        {canAssign ? (
          <div className="flex flex-col gap-gutter">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[240px] flex-1 flex-col gap-2">
                <Label htmlFor="assignee">{t("assign.toMember")}</Label>
                <Select
                  id="assignee"
                  items={roster
                    .filter((member) => member.user_id !== assignedUserId)
                    .map((member) => ({
                      value: member.user_id,
                      label: `${member.name} · ${member.email}`,
                    }))}
                  onValueChange={setChoice}
                  placeholder={t("assign.pickMember")}
                  value={choice}
                />
              </div>
              <Button
                disabled={choice === NOBODY}
                icon={UserCheck}
                loading={assign.isPending}
                onClick={() => {
                  assign.mutate({ user_id: choice })
                }}
                variant="primary"
              >
                {assign.isPending ? t("assign.assigning") : t("assign.assign")}
              </Button>
            </div>

            <form
              className="flex flex-wrap items-end gap-3"
              noValidate
              onSubmit={(event) => {
                submitEmail(event)
              }}
            >
              <div className="flex min-w-[240px] flex-1 flex-col gap-2">
                <Label htmlFor="assign-email">{t("assign.orEmail")}</Label>
                <Input
                  autoComplete="off"
                  className="font-data"
                  id="assign-email"
                  placeholder={t("assign.emailPlaceholder")}
                  type="email"
                  {...form.register("email")}
                />
              </div>
              <Button icon={Mail} loading={assign.isPending} type="submit">
                {t("assign.inviteAndAssign")}
              </Button>
            </form>

            <FieldError>{form.formState.errors.email?.message}</FieldError>

            <p className="text-[13px] text-ink-3">
              {t("assign.unknownAddress")}
            </p>

            {assignedUserId || pendingAssignmentEmail ? (
              <div className="flex justify-start">
                <ConfirmDialog
                  busy={unassign.isPending}
                  busyLabel={t("assign.removing")}
                  confirmLabel={t("assign.remove")}
                  description={t("assign.removeDescription", {
                    server: serverName,
                  })}
                  onConfirm={() => {
                    unassign.mutate()
                  }}
                  title={t("assign.removeTitle")}
                  triggerLabel={t("assign.removeAssignment")}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
