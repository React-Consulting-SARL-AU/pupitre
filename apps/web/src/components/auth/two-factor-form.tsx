import { KeyRound, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { leaveFor } from "@/lib/config/urls"

const TOTP_LENGTH = 6

export interface TwoFactorFormProps {
  callbackURL: string
}

export function TwoFactorForm({ callbackURL }: TwoFactorFormProps) {
  const t = useTranslations()
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
            ? t("auth.twoFactor.wrongRecovery")
            : t("auth.twoFactor.wrongCode")
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
          {recovery
            ? t("auth.twoFactor.recoveryLabel")
            : t("auth.twoFactor.codeLabel")}
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
          {verification.phase === "pending"
            ? t("auth.twoFactor.pending")
            : t("common.continue")}
        </Button>
        {verification.error ? (
          <Callout
            fix={
              recovery
                ? t("auth.twoFactor.recoveryFix")
                : t("auth.twoFactor.codeFix")
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
          ? t("auth.twoFactor.useApp")
          : t("auth.twoFactor.useRecovery")}
      </Button>
    </div>
  )
}
