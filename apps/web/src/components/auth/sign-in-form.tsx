import { Fingerprint, KeyRound, Mail } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { leaveFor } from "@/lib/config/urls"
import { type SignInInput, signInSchema } from "@/lib/schemas/auth"

const CALLBACK_URL = "/dashboard/servers"

export function SignInForm() {
  const form = useForm<SignInInput>({
    schema: signInSchema,
    defaultValues: { email: "" },
  })
  const magicLink = useRequestCycle()
  const passkey = useRequestCycle()
  const [sentTo, setSentTo] = useState<string | null>(null)

  function signInWithPasskey() {
    return passkey.run(async () => {
      const result = await authClient().signIn.passkey()

      if (result?.error) {
        throw new Error(
          "Aucune clé d'accès n'a répondu. Utilisez le lien de connexion."
        )
      }

      leaveFor(CALLBACK_URL)
    })
  }

  const submit = form.handleSubmit((values) =>
    magicLink.run(async () => {
      const { error } = await authClient().signIn.magicLink({
        email: values.email,
        callbackURL: CALLBACK_URL,
      })

      if (error) {
        throw new Error(
          "Le lien n'a pas pu être envoyé. Vérifiez l'adresse et réessayez."
        )
      }

      setSentTo(values.email)
    })
  )

  if (sentTo) {
    return (
      <Callout
        fix="Le lien vaut quinze minutes. Sans rien dans la boîte, regardez les indésirables."
        title={`Un lien de connexion part vers ${sentTo}.`}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          submit(event)
        }}
      >
        <Label htmlFor="email">Adresse email</Label>
        <Input
          autoComplete="email"
          id="email"
          placeholder="vous@exemple.com"
          type="email"
          {...form.register("email")}
        />
        <FieldError>{form.formState.errors.email?.message}</FieldError>
        <Button
          className="mt-2"
          disabled={magicLink.phase === "pending"}
          type="submit"
          variant="primary"
        >
          <Mail className="size-4" strokeWidth={1.5} />
          {magicLink.phase === "pending"
            ? "Envoi du lien…"
            : "Recevoir un lien de connexion"}
        </Button>
        {magicLink.error ? (
          <Callout title={magicLink.error} tone="danger" />
        ) : null}
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
          ou
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        disabled={passkey.phase === "pending"}
        onClick={() => {
          signInWithPasskey()
        }}
      >
        <Fingerprint className="size-4" strokeWidth={1.5} />
        {passkey.phase === "pending"
          ? "En attente de votre appareil…"
          : "Utiliser une clé d'accès"}
      </Button>

      <Button
        onClick={() => {
          authClient().signIn.social({
            provider: "github",
            callbackURL: CALLBACK_URL,
          })
        }}
      >
        <KeyRound className="size-4" strokeWidth={1.5} />
        Continuer avec GitHub
      </Button>

      {passkey.error ? <Callout title={passkey.error} tone="danger" /> : null}
    </div>
  )
}
