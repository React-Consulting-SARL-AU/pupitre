import { accountCallbackLink } from "@pupitre/shared/app-links"
import { useEffect, useState } from "react"
import { DeviceSignInAgain } from "@/components/auth/device-sign-in-again"
import { Button, buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { FieldError } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useForm } from "@/hooks/use-form"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import {
  approveDeviceCode,
  DeviceCodeError,
  denyDeviceCode,
  formatUserCode,
  lookupDeviceCode,
  needsFreshSignIn,
  normalizeUserCode,
} from "@/lib/auth/device-flow"
import { appOrigin, leaveFor } from "@/lib/config/urls"
import type { DictionaryKey } from "@/lib/i18n/en"
import { type DeviceCodeInput, deviceCodeSchema } from "@/lib/schemas/auth"

export type DeviceStep =
  | "code"
  | "confirm"
  | "approved"
  | "denied"
  | "reauthenticate"

/** Where a confirmed device is sent back: the app, which takes the session over. */
export const APP_RETURN_LINK = accountCallbackLink({ device: "approved" })

const DEVICE_ERRORS = new Set([
  "invalid_user_code",
  "expired_user_code",
  "unauthenticated",
  "forbidden",
])

function deviceErrorKey(error: unknown): DictionaryKey {
  if (error instanceof DeviceCodeError && DEVICE_ERRORS.has(error.code)) {
    return `device.error.${error.code}` as DictionaryKey
  }

  return "device.error.unknown"
}

export interface DeviceCodeFormProps {
  initialCode?: string
}

export function DeviceCodeForm({ initialCode = "" }: DeviceCodeFormProps) {
  const t = useTranslations()
  const [step, setStep] = useState<DeviceStep>("code")
  const [code, setCode] = useState(normalizeUserCode(initialCode))
  const cycle = useRequestCycle()
  const form = useForm<DeviceCodeInput>({
    schema: deviceCodeSchema(t),
    defaultValues: { code: formatUserCode(initialCode) },
  })

  const check = form.handleSubmit((values) =>
    cycle.run(async () => {
      try {
        await lookupDeviceCode(appOrigin(), values.code)
      } catch (error) {
        throw new Error(t(deviceErrorKey(error)))
      }

      setCode(normalizeUserCode(values.code))
      setStep("confirm")
    })
  )

  function decide(approve: boolean) {
    cycle.run(async () => {
      try {
        if (approve) {
          await approveDeviceCode(appOrigin(), code)
          setStep("approved")

          return
        }

        await denyDeviceCode(appOrigin(), code)
      } catch (error) {
        if (needsFreshSignIn(error)) {
          setStep("reauthenticate")

          return
        }

        throw new Error(t(deviceErrorKey(error)))
      }

      setStep("denied")
    })
  }

  if (step === "approved") {
    return <DeviceApproved />
  }

  if (step === "reauthenticate") {
    return <DeviceSignInAgain userCode={code} />
  }

  if (step === "denied") {
    return (
      <Callout
        fix={t("auth.device.deniedFix")}
        title={t("auth.device.denied")}
      />
    )
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-ink-2">{t("auth.device.confirmLead")}</p>
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
            {t("auth.device.confirm")}
          </Button>
          <Button
            disabled={cycle.phase === "pending"}
            onClick={() => {
              decide(false)
            }}
            variant="danger"
          >
            {t("auth.device.deny")}
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
      <Label htmlFor="device-code">{t("auth.device.codeLabel")}</Label>
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
        {t("auth.device.check")}
      </Button>
      {cycle.error ? <Callout title={cycle.error} tone="danger" /> : null}
    </form>
  )
}

/**
 * The browser is asked to hand the reader back to the app; when it will not
 * without a click, the button does it, and the app polls anyway.
 */
function DeviceApproved() {
  const t = useTranslations()

  useEffect(() => {
    leaveFor(APP_RETURN_LINK)
  }, [])

  return (
    <div className="flex flex-col gap-4" data-testid="device-approved">
      <Callout
        fix={t("auth.device.approvedFix")}
        title={t("auth.device.approved")}
        tone="ok"
      />
      <a
        className={buttonClassName({ variant: "primary" })}
        href={APP_RETURN_LINK}
      >
        {t("auth.device.openApp")}
      </a>
    </div>
  )
}
