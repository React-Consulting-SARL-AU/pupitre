import { KeyRound } from "lucide-react"
import { buttonClassName } from "@/components/ui/button"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "@/hooks/use-locale"
import type { DictionaryKey } from "@/lib/i18n/en"

const LINK_STEPS: DictionaryKey[] = [
  "download.link.open",
  "download.link.screen",
  "download.link.code",
  "download.link.enrol",
]

export function LinkAppCard() {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("download.link.title")}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-gutter">
        <ol className="flex flex-col gap-3">
          {LINK_STEPS.map((step, index) => (
            <li className="flex items-start gap-3" key={step}>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-raised font-data text-[11px] text-ink-2 tabular-nums">
                {index + 1}
              </span>
              <p className="text-[13px] text-ink-2">{t(step)}</p>
            </li>
          ))}
        </ol>

        <div>
          <a className={buttonClassName()} href="/auth/device">
            <KeyRound className="size-4" strokeWidth={1.5} />
            {t("download.link.action")}
          </a>
        </div>
      </CardBody>
    </Card>
  )
}
