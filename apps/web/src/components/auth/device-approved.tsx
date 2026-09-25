import { accountCallbackLink } from "@pupitre/shared/app-links"
import { useEffect } from "react"
import { buttonClassName } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { useTranslations } from "@/hooks/use-locale"
import { leaveFor } from "@/lib/config/urls"

const APP_RETURN_LINK = accountCallbackLink({ device: "approved" })

// The browser may refuse to hand the reader back without a click: the button does it, and the app polls anyway.
export function DeviceApproved() {
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
