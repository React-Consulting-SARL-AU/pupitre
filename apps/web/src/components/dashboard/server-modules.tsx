import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { ServiceLogo } from "@/components/ui/service-logo"
import { useTranslations } from "@/hooks/use-locale"

export interface ServerModulesProps {
  modules: string[]
  stackVersion: string | null
}

export function ServerModules({ modules, stackVersion }: ServerModulesProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("modules.title")}</CardTitle>
        <span className="font-data text-[12px] text-ink-3 tabular-nums">
          {stackVersion ?? t("format.none")}
        </span>
      </CardHeader>
      <CardBody>
        {modules.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t("modules.empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {modules.map((moduleId) => (
              <li
                className="flex items-center gap-2 rounded-sm bg-sunken px-2 py-[6px]"
                key={moduleId}
              >
                <ServiceLogo moduleId={moduleId} size={16} />
                <span className="font-data text-[12px] text-ink-2">
                  {moduleId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
