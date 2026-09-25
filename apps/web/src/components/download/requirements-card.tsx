import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import { APP_REQUIREMENTS, SERVER_REQUIREMENTS } from "@/lib/domain/downloads"

export function RequirementsCard() {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("download.requirements")}</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-section sm:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="text-label">{t("download.forApp")}</h3>
          <ul className="flex flex-col gap-2">
            {APP_REQUIREMENTS.map((target) => (
              <li className="text-[13px] text-ink-2" key={target.os}>
                <span className="text-ink">{t(target.label)}</span> —{" "}
                {t(target.requirement)}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-label">{t("download.forServer")}</h3>
          <ul className="flex flex-col gap-2">
            {SERVER_REQUIREMENTS.map((line) => (
              <li className="text-[13px] text-ink-2" key={line}>
                {t(line)}
              </li>
            ))}
          </ul>
        </section>
      </CardBody>
    </Card>
  )
}
