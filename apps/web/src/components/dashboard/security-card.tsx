import { PasskeyPanel } from "@/components/dashboard/passkey-panel"
import { TwoFactorPanel } from "@/components/dashboard/two-factor-panel"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"

export function SecurityCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sécurité</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-section">
        <p className="text-[13px] text-ink-2">
          La connexion se fait par lien magique ou par GitHub, et la session
          vaut soixante jours. Vos appareils se révoquent depuis la page
          Appareils.
        </p>

        <PasskeyPanel />

        <div aria-hidden="true" className="h-px bg-line" />

        <TwoFactorPanel />
      </CardBody>
    </Card>
  )
}
