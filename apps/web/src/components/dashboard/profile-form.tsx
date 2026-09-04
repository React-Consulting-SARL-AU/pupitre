import { useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { useForm } from "@/hooks/use-form"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { type ProfileInput, profileSchema } from "@/lib/schemas/profile"

export function ProfileForm() {
  const { user } = useDashboardContext()
  const queryClient = useQueryClient()
  const form = useForm<ProfileInput>({
    schema: profileSchema,
    defaultValues: { name: user.name },
  })
  const save = useRequestCycle()

  const submit = form.handleSubmit((values) =>
    save.run(async () => {
      const { error } = await authClient().updateUser({ name: values.name })

      if (error) {
        throw new Error("Le nom n'a pas pu être enregistré.")
      }

      await queryClient.invalidateQueries()
    })
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex max-w-md flex-col gap-gutter"
          noValidate
          onSubmit={(event) => {
            submit(event)
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nom</Label>
            <Input autoComplete="name" id="name" {...form.register("name")} />
            <FieldError>{form.formState.errors.name?.message}</FieldError>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              disabled
              id="email"
              readOnly
              type="email"
              value={user.email}
            />
            <p className="text-[12px] text-ink-3">
              L'adresse sert à vous connecter : la changer demandera une
              vérification par email, qui n'est pas encore branchée.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              disabled={save.phase === "pending"}
              type="submit"
              variant="primary"
            >
              <Check className="size-4" strokeWidth={1.5} />
              {save.phase === "pending" ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {save.phase === "done" ? (
              <span className="text-[13px] text-ink-2">Nom enregistré.</span>
            ) : null}
          </div>

          {save.error ? (
            <Callout
              fix="Réessayez dans un instant."
              title={save.error}
              tone="danger"
            />
          ) : null}
        </form>
      </CardBody>
    </Card>
  )
}
