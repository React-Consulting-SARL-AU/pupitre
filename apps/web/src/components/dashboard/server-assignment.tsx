import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, UserCheck } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusDot } from "@/components/ui/status-dot"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { usePermission } from "@/hooks/use-permission"
import {
  type AssignServerInput,
  assignServer,
  membersQueryOptions,
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
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState(NOBODY)
  const form = useForm<AssignByEmailInput, AssignByEmailValues>({
    schema: assignByEmailSchema(t),
    defaultValues: { email: "" },
  })
  const assign = useMutation({
    mutationFn: (input: AssignServerInput) => assignServer(serverId, input),
    onSuccess: async () => {
      form.reset({ email: "" })
      setChoice(NOBODY)
      await queryClient.invalidateQueries()
    },
  })
  const unassign = useMutation({
    mutationFn: () => unassignServer(serverId),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const assignee = members.data?.members.find(
    (member) => member.user_id === assignedUserId
  )
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

      <CardBody className="flex flex-col gap-gutter">
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
                <select
                  className="h-9 w-full rounded-sm border border-line-strong bg-sunken px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                  id="assignee"
                  onChange={(event) => {
                    setChoice(event.target.value)
                  }}
                  value={choice}
                >
                  <option value={NOBODY}>{t("assign.pickMember")}</option>
                  {(members.data?.members ?? [])
                    .filter((member) => member.user_id !== assignedUserId)
                    .map((member) => (
                      <option key={member.id} value={member.user_id}>
                        {member.name} · {member.email}
                      </option>
                    ))}
                </select>
              </div>
              <Button
                disabled={choice === NOBODY || assign.isPending}
                onClick={() => {
                  assign.mutate({ user_id: choice })
                }}
                variant="primary"
              >
                <UserCheck className="size-4" strokeWidth={1.5} />
                {t("assign.assign")}
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
              <Button disabled={assign.isPending} type="submit">
                <Mail className="size-4" strokeWidth={1.5} />
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
                  confirmLabel={t("assign.remove")}
                  description={t("assign.removeDescription", {
                    server: serverName,
                  })}
                  onConfirm={() => {
                    unassign.mutate()
                  }}
                  pending={unassign.isPending}
                  title={t("assign.removeTitle")}
                  triggerLabel={t("assign.removeAssignment")}
                />
              </div>
            ) : null}

            {assign.isError ? (
              <Callout
                fix={t("assign.failedFix")}
                title={t("assign.failed")}
                tone="danger"
              />
            ) : null}

            {unassign.isError ? (
              <Callout
                fix={t("assign.removeFailedFix")}
                title={t("assign.removeFailed")}
                tone="danger"
              />
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
