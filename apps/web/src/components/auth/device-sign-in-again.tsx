import { FRESH_SIGN_IN_SECONDS } from "@pupitre/shared/keys"
import { Link } from "@tanstack/react-router"
import { buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { deviceReturnPath } from "@/lib/auth/device-flow"

const MINUTE_SECONDS = 60

export interface DeviceSignInAgainProps {
  userCode: string
}

export function DeviceSignInAgain({ userCode }: DeviceSignInAgainProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4" data-testid="device-sign-in-again">
      <Callout
        title={t("auth.device.signInAgain", {
          minutes: FRESH_SIGN_IN_SECONDS / MINUTE_SECONDS,
        })}
        tone="warn"
      />
      <Link
        className={buttonClassName({ variant: "primary" })}
        search={{ callbackURL: deviceReturnPath(userCode) }}
        to="/auth/sign-in"
      >
        {t("auth.device.signInAgainAction")}
      </Link>
    </div>
  )
}
