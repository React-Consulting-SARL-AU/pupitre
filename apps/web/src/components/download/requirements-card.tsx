import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { APP_REQUIREMENTS, SERVER_REQUIREMENTS } from "@/lib/domain/downloads"

export function RequirementsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration requise</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-section sm:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            Pour l'app
          </h3>
          <ul className="flex flex-col gap-2">
            {APP_REQUIREMENTS.map((target) => (
              <li className="text-[13px] text-ink-2" key={target.os}>
                <span className="text-ink">{target.label}</span> —{" "}
                {target.requirement}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[10.5px] text-ink-3 uppercase tracking-[0.08em]">
            Pour le serveur
          </h3>
          <ul className="flex flex-col gap-2">
            {SERVER_REQUIREMENTS.map((line) => (
              <li className="text-[13px] text-ink-2" key={line}>
                {line}
              </li>
            ))}
          </ul>
        </section>
      </CardBody>
    </Card>
  )
}
