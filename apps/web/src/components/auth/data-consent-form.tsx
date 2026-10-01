import { DATA_CONSENT_VERSION } from "@pupitre/shared/legal"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Check, UserX } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useTranslations } from "@/hooks/use-locale"
import { apiFailure } from "@/lib/api/errors"
import {
  declineDataConsent,
  giveDataConsent,
  type Me,
  queryKeys,
} from "@/lib/api/queries"
import { authClient } from "@/lib/auth/client"
import { DataConsentNotice } from "./data-consent-notice"

export interface DataConsentFormProps {
  callbackURL: string
}

export function DataConsentForm({ callbackURL }: DataConsentFormProps) {
  const t = useTranslations()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [agreed, setAgreed] = useState(false)

  const consent = useMutation({
    mutationFn: () => giveDataConsent(DATA_CONSENT_VERSION),
    onSuccess: async (recorded) => {
      queryClient.setQueryData<Me>(queryKeys.me, (me) =>
        me ? { ...me, data_consent: recorded } : me
      )
      await navigate({ href: callbackURL })
    },
  })

  const decline = useMutation({
    mutationFn: async () => {
      await declineDataConsent()
      await authClient().signOut()
    },
    onSuccess: async () => {
      queryClient.clear()
      await navigate({ to: "/auth/sign-in" })
    },
  })

  const refused = consent.isError ? apiFailure(consent.error) : null
  const declineRefused = decline.isError ? apiFailure(decline.error) : null

  return (
    <div className="flex flex-col gap-6">
      <DataConsentNotice />

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          consent.mutate()
        }}
      >
        <label
          className="flex cursor-pointer items-start gap-3 text-[13px] text-ink"
          htmlFor="data-consent"
        >
          <Checkbox
            checked={agreed}
            className="mt-0.5"
            id="data-consent"
            label={t("auth.consent.agree")}
            onCheckedChange={setAgreed}
          />
          <span>{t("auth.consent.agree")}</span>
        </label>

        {consent.isError ? (
          <Callout
            fix={refused?.fix ?? t("common.retryLater")}
            title={refused?.message ?? t("auth.consent.failed")}
            tone="danger"
          />
        ) : null}

        {decline.isError ? (
          <Callout
            fix={declineRefused?.fix ?? t("common.retryLater")}
            title={declineRefused?.message ?? t("auth.consent.declineFailed")}
            tone="danger"
          />
        ) : null}

        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ConfirmDialog
            busy={decline.isPending}
            busyLabel={t("auth.consent.declinePending")}
            confirmLabel={t("auth.consent.declineConfirm")}
            description={t("auth.consent.declineLead")}
            onConfirm={() => {
              decline.mutate()
            }}
            title={t("auth.consent.declineTitle")}
            triggerIcon={UserX}
            triggerLabel={t("auth.consent.decline")}
          />
          <Button
            disabled={!agreed || consent.isPending}
            icon={Check}
            loading={consent.isPending}
            type="submit"
            variant="primary"
          >
            {t("auth.consent.accept")}
          </Button>
        </div>
      </form>
    </div>
  )
}
