import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"

const PENDING = [
  {
    title: "Clés d'accès (passkeys)",
    description:
      "Se connecter par Touch ID, Windows Hello ou une clé matérielle, sans lien magique.",
  },
  {
    title: "Second facteur",
    description:
      "Un code à usage unique demandé après le lien magique, avec des codes de récupération.",
  },
]

export function SecurityCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sécurité</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <p className="text-[13px] text-ink-2">
          Aujourd'hui, la connexion se fait par lien magique ou par GitHub, et
          la session vaut soixante jours. Vos appareils se révoquent depuis la
          page Appareils.
        </p>

        <ul className="flex flex-col gap-3">
          {PENDING.map((item) => (
            <li
              className="flex flex-wrap items-start justify-between gap-4 rounded-sm border border-line bg-sunken px-3 py-2"
              key={item.title}
            >
              <div className="min-w-0">
                <p className="text-[13px] text-ink">{item.title}</p>
                <p className="text-[13px] text-ink-2">{item.description}</p>
              </div>
              <span className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
                Pas encore disponible
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
