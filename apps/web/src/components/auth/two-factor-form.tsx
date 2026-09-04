import { KeyRound, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { leaveFor } from "@/lib/config/urls"

const TOTP_LENGTH = 6

export interface TwoFactorFormProps {
  callbackURL: string
}

export function TwoFactorForm({ callbackURL }: TwoFactorFormProps) {
  const verification = useRequestCycle()
  const [recovery, setRecovery] = useState(false)
  const [code, setCode] = useState("")
  const trimmed = code.trim()

  function verify() {
    return verification.run(async () => {
      const { error } = recovery
        ? await authClient().twoFactor.verifyBackupCode({ code: trimmed })
        : await authClient().twoFactor.verifyTotp({ code: trimmed })

      if (error) {
        throw new Error(
          recovery
            ? "Ce code de récupération n'est pas valable, ou il a déjà servi."
            : "Ce code ne correspond pas."
        )
      }

      leaveFor(callbackURL)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          verify()
        }}
      >
        <Label htmlFor="two-factor-code">
          {recovery ? "Code de récupération" : "Code de l'application"}
        </Label>
        <Input
          autoComplete="one-time-code"
          autoFocus
          className="font-data tabular-nums"
          id="two-factor-code"
          inputMode={recovery ? "text" : "numeric"}
          onChange={(event) => {
            setCode(event.target.value)
          }}
          placeholder={recovery ? "abcde-fghij" : "000000"}
          value={code}
        />
        <Button
          className="mt-2"
          disabled={
            verification.phase === "pending" ||
            trimmed.length < (recovery ? 1 : TOTP_LENGTH)
          }
          type="submit"
          variant="primary"
        >
          <ShieldCheck className="size-4" strokeWidth={1.5} />
          {verification.phase === "pending" ? "Vérification…" : "Continuer"}
        </Button>
        {verification.error ? (
          <Callout
            fix={
              recovery
                ? "Chaque code ne sert qu'une fois. Essayez le suivant sur votre liste."
                : "Les codes changent toutes les trente secondes ; vérifiez aussi l'heure du téléphone."
            }
            title={verification.error}
            tone="danger"
          />
        ) : null}
      </form>

      <Button
        onClick={() => {
          setRecovery((current) => !current)
          setCode("")
          verification.reset()
        }}
        variant="ghost"
      >
        <KeyRound className="size-4" strokeWidth={1.5} />
        {recovery
          ? "Revenir au code de l'application"
          : "Utiliser un code de récupération"}
      </Button>
    </div>
  )
}
