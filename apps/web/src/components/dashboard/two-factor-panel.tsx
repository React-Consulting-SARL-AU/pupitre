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
        throw new Error(
          "Le second facteur n'a pas pu être préparé. Réessayez dans un instant."
        )
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
        throw new Error("Ce code ne correspond pas. Regardez le suivant.")
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
        throw new Error("Le second facteur n'a pas pu être désactivé.")
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
          Second facteur
          {enabled.data ? (
            <StatusDot label="Actif" shape="filled" tone="ok" />
          ) : null}
        </h3>
        <p className="mt-1 text-[13px] text-ink-2">
          Un code à usage unique, demandé après le lien magique et après GitHub.
          Pas après une clé d'accès : elle est déjà un second facteur.
        </p>
      </div>

      {enabled.isPending ? (
        <LoadingState label="Lecture de votre second facteur…" />
      ) : null}

      {enabled.data && !setup ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-line bg-sunken px-3 py-3">
          <p className="text-[13px] text-ink-2">
            Actif. Vos codes de récupération remplacent l'application si vous
            perdez le téléphone.
          </p>
          <ConfirmDialog
            confirmLabel="Désactiver"
            description="La connexion ne demandera plus de code après le lien magique. Vos codes de récupération sont effacés."
            onConfirm={() => {
              disable()
            }}
            pending={removal.phase === "pending"}
            title="Désactiver le second facteur ?"
            triggerLabel="Désactiver"
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
            ? "Préparation…"
            : "Activer le second facteur"}
        </Button>
      ) : null}

      {activation.error ? (
        <Callout
          fix="Réessayez dans un instant."
          title={activation.error}
          tone="danger"
        />
      ) : null}

      {removal.error ? (
        <Callout
          fix="Rechargez la page, puis réessayez."
          title={removal.error}
          tone="danger"
        />
      ) : null}

      {setup ? (
        <div className="flex flex-col gap-gutter rounded-sm border border-line bg-sunken p-4">
          <div className="flex flex-wrap items-start gap-gutter">
            <QrCode label="QR code du second facteur" value={setup.totpURI} />
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
              <p className="text-[13px] text-ink">
                Scannez ce code avec votre application d'authentification.
              </p>
              <Label>Clé à saisir à la main</Label>
              <p className="break-all font-data text-[12px] text-ink-2">
                {secretOf(setup.totpURI)}
              </p>
            </div>
          </div>

          <div>
            <Label>Codes de récupération</Label>
            <p className="mt-1 text-[13px] text-ink-2">
              Notez-les maintenant : ils ne seront plus affichés, et chacun ne
              sert qu'une fois.
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
              <p className="text-[13px] text-ink">
                Le second facteur est actif.
              </p>
              <Button
                onClick={() => {
                  setSetup(null)
                }}
                variant="primary"
              >
                J'ai noté mes codes
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-[160px] flex-col gap-2">
                <Label htmlFor="totp-code">Code de l'application</Label>
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
                  ? "Vérification…"
                  : "Confirmer"}
              </Button>
              <Button
                onClick={() => {
                  setSetup(null)
                }}
                variant="ghost"
              >
                Annuler
              </Button>
            </div>
          )}

          {confirmation.error ? (
            <Callout
              fix="Les codes changent toutes les trente secondes ; vérifiez aussi l'heure du téléphone."
              title={confirmation.error}
              tone="danger"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
