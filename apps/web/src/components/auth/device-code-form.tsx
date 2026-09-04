import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import {
  approveDeviceCode,
  denyDeviceCode,
  formatUserCode,
  lookupDeviceCode,
  normalizeUserCode,
} from "@/lib/auth/device-flow"
import { appOrigin } from "@/lib/config/urls"
import { type DeviceCodeInput, deviceCodeSchema } from "@/lib/schemas/auth"

export type DeviceStep = "code" | "confirm" | "approved" | "denied"

export interface DeviceCodeFormProps {
  initialCode?: string
}

export function DeviceCodeForm({ initialCode = "" }: DeviceCodeFormProps) {
  const [step, setStep] = useState<DeviceStep>("code")
  const [code, setCode] = useState(normalizeUserCode(initialCode))
  const cycle = useRequestCycle()
  const form = useForm<DeviceCodeInput>({
    schema: deviceCodeSchema,
    defaultValues: { code: formatUserCode(initialCode) },
  })

  const check = form.handleSubmit((values) =>
    cycle.run(async () => {
      await lookupDeviceCode(appOrigin(), values.code)
      setCode(normalizeUserCode(values.code))
      setStep("confirm")
    })
  )

  function decide(approve: boolean) {
    cycle.run(async () => {
      if (approve) {
        await approveDeviceCode(appOrigin(), code)
        setStep("approved")

        return
      }

      await denyDeviceCode(appOrigin(), code)
      setStep("denied")
    })
  }

  if (step === "approved") {
    return (
      <Callout
        data-testid="device-approved"
        fix="Retournez à l'app Pupitre : elle prend la main dans quelques secondes."
        title="Appareil confirmé."
      />
    )
  }

  if (step === "denied") {
    return (
      <Callout
        fix="Si ce n'était pas vous, aucune session n'a été ouverte."
        title="Demande refusée."
      />
    )
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-ink-2">
          Un appareil demande à ouvrir une session sur votre compte. Vérifiez
          que ce code est bien celui affiché sur l'appareil.
        </p>
        <p className="rounded-sm bg-sunken px-4 py-4 text-center font-data text-[22px] text-ink tracking-[0.2em]">
          {formatUserCode(code)}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={cycle.phase === "pending"}
            onClick={() => {
              decide(true)
            }}
            variant="primary"
          >
            Confirmer cet appareil
          </Button>
          <Button
            disabled={cycle.phase === "pending"}
            onClick={() => {
              decide(false)
            }}
            variant="danger"
          >
            Refuser
          </Button>
        </div>
        {cycle.error ? <Callout title={cycle.error} tone="danger" /> : null}
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        check(event)
      }}
    >
      <Label htmlFor="device-code">Code affiché par l'appareil</Label>
      <Input
        autoComplete="one-time-code"
        className="text-center font-data text-[18px] uppercase tracking-[0.2em]"
        id="device-code"
        placeholder="XXXX-XXXX"
        {...form.register("code")}
      />
      <FieldError>{form.formState.errors.code?.message}</FieldError>
      <Button
        className="mt-2"
        disabled={cycle.phase === "pending"}
        type="submit"
        variant="primary"
      >
        Vérifier le code
      </Button>
      {cycle.error ? <Callout title={cycle.error} tone="danger" /> : null}
    </form>
  )
}
