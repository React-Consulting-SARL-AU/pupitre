import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldCheck } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { QrCode } from "@/components/ui/qr-code"
import { StatusDot } from "@/components/ui/status-dot"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { twoFactorEnabledQueryOptions } from "@/lib/auth/queries"

const CODE_LENGTH = 6

interface Setup {
  totpURI: string
  backupCodes: string[]
}

function secretOf(totpURI: string): string {
  return new URL(totpURI).searchParams.get("secret") ?? ""
}

export function TwoFactorPanel() {
  const t = useTranslations()
  const enabled = useQuery(twoFactorEnabledQueryOptions())
  const queryClient = useQueryClient()
  const activation = useRequestCycle()
  const confirmation = useRequestCycle()
  const removal = useRequestCycle()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [code, setCode] = useState("")

  function activate() {
    return activation.run(async () => {
      const { data, error } = await authClient().twoFactor.enable({})

      if (error || !data) {
        throw new Error(t("twoFactor.prepareFailed"))
      }

      setConfirmed(false)
      setCode("")
      setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes })
    })
  }

  function confirm() {
    return confirmation.run(async () => {
      const { error } = await authClient().twoFactor.verifyTotp({ code })

      if (error) {
        throw new Error(t("twoFactor.wrongCode"))
      }

      setConfirmed(true)
      setCode("")
      await queryClient.invalidateQueries(twoFactorEnabledQueryOptions())
    })
  }

  function disable() {
    return removal.run(async () => {
      const { error } = await authClient().twoFactor.disable({})

      if (error) {
        throw new Error(t("twoFactor.disableFailed"))
      }

      setSetup(null)
      setConfirmed(false)
      await queryClient.invalidateQueries(twoFactorEnabledQueryOptions())
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-medium text-[13px] text-ink">
          {t("twoFactor.title")}
          {enabled.data ? (
            <StatusDot label={t("twoFactor.active")} shape="filled" tone="ok" />
          ) : null}
        </h3>
        <p className="mt-1 text-[13px] text-ink-2">{t("twoFactor.lead")}</p>
      </div>

      {enabled.isPending ? (
        <LoadingState label={t("twoFactor.reading")} />
      ) : null}

      {enabled.data && !setup ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-line bg-sunken px-3 py-3">
          <p className="text-[13px] text-ink-2">{t("twoFactor.activeLead")}</p>
          <ConfirmDialog
            busy={removal.phase === "pending"}
            confirmLabel={t("twoFactor.disable")}
            description={t("twoFactor.disableDescription")}
            onConfirm={() => {
              disable()
            }}
            title={t("twoFactor.disableTitle")}
            triggerLabel={t("twoFactor.disable")}
          />
        </div>
      ) : null}

      {enabled.data === false && !setup ? (
        <Button
          className="self-start"
          disabled={activation.phase === "pending"}
          onClick={() => {
            activate()
          }}
          variant="primary"
        >
          <ShieldCheck className="size-4" strokeWidth={1.5} />
          {activation.phase === "pending"
            ? t("twoFactor.preparing")
            : t("twoFactor.enable")}
        </Button>
      ) : null}

      {activation.error ? (
        <Callout
          fix={t("twoFactor.prepareFailedFix")}
          title={activation.error}
          tone="danger"
        />
      ) : null}

      {removal.error ? (
        <Callout
          fix={t("twoFactor.disableFailedFix")}
          title={removal.error}
          tone="danger"
        />
      ) : null}

      {setup ? (
        <div className="flex flex-col gap-gutter rounded-sm border border-line bg-sunken p-4">
          <div className="flex flex-wrap items-start gap-gutter">
            <QrCode label={t("twoFactor.qrLabel")} value={setup.totpURI} />
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <p className="text-[13px] text-ink">{t("twoFactor.scan")}</p>
              <Label>{t("twoFactor.manualKey")}</Label>
              <p className="break-all font-data text-[12px] text-ink-2">
                {secretOf(setup.totpURI)}
              </p>
            </div>
          </div>

          <div>
            <Label>{t("twoFactor.recoveryCodes")}</Label>
            <p className="mt-1 text-[13px] text-ink-2">
              {t("twoFactor.recoveryLead")}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {setup.backupCodes.map((backupCode) => (
                <li
                  className="font-data text-[12px] text-ink tabular-nums"
                  key={backupCode}
                >
                  {backupCode}
                </li>
              ))}
            </ul>
          </div>

          {confirmed ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[13px] text-ink">{t("twoFactor.done")}</p>
              <Button
                onClick={() => {
                  setSetup(null)
                }}
                variant="primary"
              >
                {t("twoFactor.acknowledged")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-[160px] flex-col gap-2">
                <Label htmlFor="totp-code">{t("twoFactor.codeLabel")}</Label>
                <Input
                  autoComplete="one-time-code"
                  className="font-data tabular-nums"
                  id="totp-code"
                  inputMode="numeric"
                  maxLength={CODE_LENGTH}
                  onChange={(event) => {
                    setCode(event.target.value.trim())
                  }}
                  placeholder="000000"
                  value={code}
                />
              </div>
              <Button
                disabled={
                  code.length !== CODE_LENGTH ||
                  confirmation.phase === "pending"
                }
                onClick={() => {
                  confirm()
                }}
                variant="primary"
              >
                {confirmation.phase === "pending"
                  ? t("twoFactor.checking")
                  : t("twoFactor.confirm")}
              </Button>
              <Button
                onClick={() => {
                  setSetup(null)
                }}
                variant="ghost"
              >
                {t("common.cancel")}
              </Button>
            </div>
          )}

          {confirmation.error ? (
            <Callout
              fix={t("twoFactor.wrongCodeFix")}
              title={confirmation.error}
              tone="danger"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
