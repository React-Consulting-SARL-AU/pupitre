import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Fingerprint, RotateCw } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SkeletonLines } from "@/components/ui/skeleton"
import { useTranslations } from "@/hooks/use-locale"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { passkeysQueryOptions } from "@/lib/auth/queries"
import { formatRelative } from "@/lib/utils/format"

const STALE_SESSION_STATUS = 403

function browserSupportsPasskeys(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window
}

export function PasskeyPanel() {
  const t = useTranslations()
  const passkeys = useQuery(passkeysQueryOptions())
  const queryClient = useQueryClient()
  const registration = useRequestCycle()
  const revocation = useRequestCycle()
  const [name, setName] = useState("")
  const [staleSession, setStaleSession] = useState(false)
  const supported = browserSupportsPasskeys()

  function registrationMessage(error: {
    status?: number
    message?: string
  }): string {
    if (error.status === STALE_SESSION_STATUS) {
      return t("passkeys.staleSession")
    }

    return error.message ?? t("passkeys.registerFailed")
  }

  function register() {
    return registration.run(async () => {
      const result = await authClient().passkey.addPasskey({
        name: name.trim() || t("passkeys.defaultName"),
      })

      if (result?.error) {
        setStaleSession(result.error.status === STALE_SESSION_STATUS)
        throw new Error(registrationMessage(result.error))
      }

      setStaleSession(false)

      setName("")
      await queryClient.invalidateQueries(passkeysQueryOptions())
    })
  }

  function revoke(id: string) {
    return revocation.run(async () => {
      const { error } = await authClient().passkey.deletePasskey({ id })

      if (error) {
        throw new Error(t("passkeys.revokeFailed"))
      }

      await queryClient.invalidateQueries(passkeysQueryOptions())
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium text-[13px] text-ink">
          {t("passkeys.title")}
        </h3>
        <p className="mt-1 text-[13px] text-ink-2">{t("passkeys.lead")}</p>
      </div>

      {passkeys.isPending ? (
        <SkeletonLines label={t("passkeys.reading")} rows={2} />
      ) : null}

      {passkeys.isError ? (
        <Callout
          action={
            <Button
              icon={RotateCw}
              loading={passkeys.isFetching}
              onClick={() => {
                passkeys.refetch()
              }}
              size="sm"
            >
              {t("common.retry")}
            </Button>
          }
          fix={t("passkeys.readFailedFix")}
          title={t("passkeys.readFailed")}
          tone="danger"
        />
      ) : null}

      {passkeys.data?.length === 0 ? (
        <p className="rounded-sm border border-line bg-sunken px-3 py-2 text-[13px] text-ink-2">
          {t("passkeys.empty")}
        </p>
      ) : null}

      {passkeys.data && passkeys.data.length > 0 ? (
        <ul className="overflow-hidden rounded-sm border border-line">
          {passkeys.data.map((passkey) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 border-line border-b bg-sunken px-3 py-3 last:border-b-0"
              key={passkey.id}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">
                  {passkey.name || t("passkeys.unnamed")}
                </p>
                <p className="text-[12px] text-ink-3">
                  {t("passkeys.added", {
                    when: formatRelative(passkey.createdAt ?? null, t),
                  })}
                </p>
              </div>
              <ConfirmDialog
                busy={revocation.phase === "pending"}
                confirmLabel={t("passkeys.revoke")}
                description={t("passkeys.revokeDescription", {
                  name: passkey.name || t("passkeys.unnamed"),
                })}
                onConfirm={() => {
                  revoke(passkey.id)
                }}
                title={t("passkeys.revokeTitle")}
                triggerLabel={t("passkeys.revoke")}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {revocation.error ? (
        <Callout
          fix={t("passkeys.revokeFailedFix")}
          title={revocation.error}
          tone="danger"
        />
      ) : null}

      {supported ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            <Label htmlFor="passkey-name">{t("passkeys.nameLabel")}</Label>
            <Input
              autoComplete="off"
              id="passkey-name"
              onChange={(event) => {
                setName(event.target.value)
              }}
              placeholder={t("passkeys.namePlaceholder")}
              value={name}
            />
          </div>
          <Button
            disabled={registration.phase === "pending"}
            onClick={() => {
              register()
            }}
            variant="primary"
          >
            <Fingerprint className="size-4" strokeWidth={1.5} />
            {registration.phase === "pending"
              ? t("passkeys.registering")
              : t("passkeys.register")}
          </Button>
        </div>
      ) : (
        <Callout
          fix={t("passkeys.unsupportedFix")}
          title={t("passkeys.unsupported")}
        />
      )}

      {registration.error ? (
        <Callout
          fix={
            staleSession
              ? t("passkeys.staleSessionFix")
              : t("passkeys.registerFailedFix")
          }
          title={registration.error}
          tone="danger"
        />
      ) : null}
    </section>
  )
}
