import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Fingerprint } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Callout } from "@/components/ui/callout"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingState } from "@/components/ui/loading-state"
import { useRequestCycle } from "@/hooks/use-request-cycle"
import { authClient } from "@/lib/auth/client"
import { passkeysQueryOptions } from "@/lib/auth/queries"
import { formatRelative } from "@/lib/utils/format"

const STALE_SESSION_STATUS = 403

const STALE_SESSION_FIX =
  "Reconnectez-vous, puis réessayez : enregistrer une clé demande une session récente."

function browserSupportsPasskeys(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window
}

function registrationMessage(error: {
  status?: number
  message?: string
}): string {
  if (error.status === STALE_SESSION_STATUS) {
    return "Votre session est trop ancienne pour enregistrer une clé."
  }

  return (
    error.message ??
    "La clé n'a pas été enregistrée. L'appareil a peut-être annulé la demande."
  )
}

export function PasskeyPanel() {
  const passkeys = useQuery(passkeysQueryOptions())
  const queryClient = useQueryClient()
  const registration = useRequestCycle()
  const revocation = useRequestCycle()
  const [name, setName] = useState("")
  const supported = browserSupportsPasskeys()

  function register() {
    return registration.run(async () => {
      const result = await authClient().passkey.addPasskey({
        name: name.trim() || "Cet appareil",
      })

      if (result?.error) {
        throw new Error(registrationMessage(result.error))
      }

      setName("")
      await queryClient.invalidateQueries(passkeysQueryOptions())
    })
  }

  function revoke(id: string) {
    return revocation.run(async () => {
      const { error } = await authClient().passkey.deletePasskey({ id })

      if (error) {
        throw new Error("La clé n'a pas pu être révoquée.")
      }

      await queryClient.invalidateQueries(passkeysQueryOptions())
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium text-[13px] text-ink">
          Clés d'accès (passkeys)
        </h3>
        <p className="mt-1 text-[13px] text-ink-2">
          Touch ID, Windows Hello ou une clé matérielle ouvrent la session sans
          lien magique. Une clé enregistrée vaut à elle seule deux facteurs :
          l'appareil et vous.
        </p>
      </div>

      {passkeys.isPending ? (
        <LoadingState label="Lecture de vos clés d'accès…" />
      ) : null}

      {passkeys.isError ? (
        <Callout
          fix="Rechargez la page ; si cela persiste, reconnectez-vous."
          title="Vos clés d'accès n'ont pas pu être lues."
          tone="danger"
        />
      ) : null}

      {passkeys.data?.length === 0 ? (
        <p className="rounded-sm border border-line bg-sunken px-3 py-2 text-[13px] text-ink-2">
          Aucune clé enregistrée. La connexion passe encore par le lien magique
          ou par GitHub.
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
                  {passkey.name || "Clé sans nom"}
                </p>
                <p className="text-[12px] text-ink-3">
                  ajoutée {formatRelative(passkey.createdAt ?? null)}
                </p>
              </div>
              <ConfirmDialog
                confirmLabel="Révoquer"
                description={`« ${passkey.name || "Clé sans nom"} » n'ouvrira plus de session. Les autres clés et le lien magique restent.`}
                onConfirm={() => {
                  revoke(passkey.id)
                }}
                pending={revocation.phase === "pending"}
                title="Révoquer cette clé d'accès ?"
                triggerLabel="Révoquer"
              />
            </li>
          ))}
        </ul>
      ) : null}

      {revocation.error ? (
        <Callout
          fix="Réessayez dans un instant."
          title={revocation.error}
          tone="danger"
        />
      ) : null}

      {supported ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            <Label htmlFor="passkey-name">Nom de la clé</Label>
            <Input
              autoComplete="off"
              id="passkey-name"
              onChange={(event) => {
                setName(event.target.value)
              }}
              placeholder="MacBook du bureau"
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
              ? "En attente de l'appareil…"
              : "Enregistrer une clé"}
          </Button>
        </div>
      ) : (
        <Callout
          fix="Ouvrez la console dans Safari, Chrome ou Edge à jour, sur un appareil qui gère les clés d'accès."
          title="Ce navigateur ne sait pas créer de clé d'accès."
        />
      )}

      {registration.error ? (
        <Callout
          fix={
            registration.error.includes("trop ancienne")
              ? STALE_SESSION_FIX
              : "Réessayez, et confirmez la demande de votre appareil."
          }
          title={registration.error}
          tone="danger"
        />
      ) : null}
    </section>
  )
}
