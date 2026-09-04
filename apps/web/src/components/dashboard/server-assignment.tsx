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
import { usePermission } from "@/hooks/use-permission"
import {
  type AssignServerInput,
  assignServer,
  membersQueryOptions,
  unassignServer,
} from "@/lib/api/queries"
import { roleLabel } from "@/lib/domain/roles"
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
    schema: assignByEmailSchema,
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
        <CardTitle>Attribution</CardTitle>
        {assignedUserId ? (
          <span className="inline-flex items-center gap-2">
            <StatusDot label="Attribué" shape="filled" tone="ok" />
            <span className="text-[13px] text-ink-2">Attribué</span>
          </span>
        ) : null}
        {pendingAssignmentEmail ? (
          <span className="inline-flex items-center gap-2">
            <StatusDot
              label="En attente d'acceptation"
              shape="breathing"
              tone="muted"
            />
            <span className="text-[13px] text-ink-2">En attente</span>
          </span>
        ) : null}
      </CardHeader>

      <CardBody className="flex flex-col gap-gutter">
        <p className="text-[13px] text-ink-2">
          {assignedUserId && assignedToViewer
            ? "Les clés de vos appareils sont déposées sur ce serveur."
            : null}
          {assignedUserId && !assignedToViewer
            ? `Les clés des appareils de ${assignee?.email ?? "la personne à qui il est attribué"} sont déposées sur ce serveur.`
            : null}
          {pendingAssignmentEmail
            ? `${pendingAssignmentEmail} a reçu une invitation. Ses clés arriveront sur ce serveur dès qu'elle l'aura acceptée.`
            : null}
          {assignedUserId || pendingAssignmentEmail
            ? null
            : "Ce serveur n'est attribué à personne : aucune clé n'y est déposée et personne ne peut l'ouvrir."}
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
              {roleLabel(assignee.role)}
            </span>
          </div>
        ) : null}

        {canAssign ? (
          <div className="flex flex-col gap-gutter">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[240px] flex-1 flex-col gap-2">
                <Label htmlFor="assignee">Attribuer à un membre</Label>
                <select
                  className="h-9 w-full rounded-sm border border-line-strong bg-sunken px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                  id="assignee"
                  onChange={(event) => {
                    setChoice(event.target.value)
                  }}
                  value={choice}
                >
                  <option value={NOBODY}>Choisir un membre…</option>
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
                Attribuer
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
                <Label htmlFor="assign-email">
                  Ou attribuer à une adresse email
                </Label>
                <Input
                  autoComplete="off"
                  className="font-data"
                  id="assign-email"
                  placeholder="prenom@agence.fr"
                  type="email"
                  {...form.register("email")}
                />
              </div>
              <Button disabled={assign.isPending} type="submit">
                <Mail className="size-4" strokeWidth={1.5} />
                Inviter et attribuer
              </Button>
            </form>

            <FieldError>{form.formState.errors.email?.message}</FieldError>

            <p className="text-[13px] text-ink-3">
              Une adresse inconnue reçoit une invitation ; le serveur l'attend
              et lui revient à l'acceptation.
            </p>

            {assignedUserId || pendingAssignmentEmail ? (
              <div className="flex justify-start">
                <ConfirmDialog
                  confirmLabel="Retirer"
                  description={`Les clés déposées sur « ${serverName} » sont retirées tout de suite, et l'agent cesse de les accepter à son prochain état.`}
                  onConfirm={() => {
                    unassign.mutate()
                  }}
                  pending={unassign.isPending}
                  title="Retirer l'attribution ?"
                  triggerLabel="Retirer l'attribution"
                />
              </div>
            ) : null}

            {assign.isError ? (
              <Callout
                fix="Vérifiez que la personne est membre de l'organisation, ou attribuez le serveur à son adresse email."
                title="L'attribution a échoué."
                tone="danger"
              />
            ) : null}

            {unassign.isError ? (
              <Callout
                fix="Réessayez ; si cela persiste, vérifiez votre rôle dans l'organisation."
                title="L'attribution n'a pas pu être retirée."
                tone="danger"
              />
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
