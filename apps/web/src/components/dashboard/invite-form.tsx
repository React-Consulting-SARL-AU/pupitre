import { useMutation, useQueryClient } from "@tanstack/react-query"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { inviteMember } from "@/lib/api/queries"
import { INVITABLE_ROLES, roleDescription, roleLabel } from "@/lib/domain/roles"
import {
  type InviteInput,
  type InviteValues,
  inviteSchema,
} from "@/lib/schemas/members"
import { cn } from "@/lib/utils/cn"

export interface InviteFormProps {
  organizationId: string
}

export function InviteForm({ organizationId }: InviteFormProps) {
  const queryClient = useQueryClient()
  const form = useForm<InviteInput, InviteValues>({
    schema: inviteSchema,
    defaultValues: { email: "", role: "member" },
  })
  const invite = useMutation({
    mutationFn: (values: InviteValues) =>
      inviteMember(organizationId, {
        email: values.email,
        role: values.role as (typeof INVITABLE_ROLES)[number],
      }),
    onSuccess: async () => {
      form.reset({ email: "", role: form.getValues("role") })
      await queryClient.invalidateQueries()
    },
  })
  const role = form.watch("role")

  const submit = form.handleSubmit((values) => {
    invite.mutate(values)
  })

  return (
    <form
      className="flex flex-col gap-gutter"
      noValidate
      onSubmit={(event) => {
        submit(event)
      }}
    >
      <div className="flex flex-wrap items-end gap-gutter">
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <Label htmlFor="invite-email">Adresse email</Label>
          <Input
            autoComplete="off"
            className="font-data"
            id="invite-email"
            placeholder="prenom@agence.fr"
            type="email"
            {...form.register("email")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Rôle</Label>
          <div className="flex h-9 items-center gap-1 rounded-sm border border-line-strong bg-sunken p-1">
            {INVITABLE_ROLES.map((candidate) => (
              <button
                aria-pressed={role === candidate}
                className={cn(
                  "h-7 rounded-sm px-3 text-[13px] transition-colors duration-[120ms] ease-[ease]",
                  "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2",
                  role === candidate
                    ? "bg-inverse text-inverse-ink"
                    : "text-ink-2 hover:bg-raised hover:text-ink"
                )}
                key={candidate}
                onClick={() => {
                  form.setValue("role", candidate)
                }}
                type="button"
              >
                {roleLabel(candidate)}
              </button>
            ))}
          </div>
        </div>

        <Button disabled={invite.isPending} type="submit" variant="primary">
          <UserPlus className="size-4" strokeWidth={1.5} />
          {invite.isPending ? "Envoi…" : "Inviter"}
        </Button>
      </div>

      <p className="text-[13px] text-ink-2">{roleDescription(role)}</p>

      <FieldError>{form.formState.errors.email?.message}</FieldError>

      {invite.isError ? (
        <Callout
          fix="Vérifiez l'adresse, et qu'elle n'est pas déjà membre de l'organisation."
          title="L'invitation n'a pas pu être envoyée."
          tone="danger"
        />
      ) : null}

      {invite.isSuccess ? (
        <Callout title="Invitation envoyée. Elle expire dans sept jours." />
      ) : null}
    </form>
  )
}
