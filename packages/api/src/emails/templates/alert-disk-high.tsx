import type { Locale } from "../../lib/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailData,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
} from "../components/pieces"
import { emailTranslator } from "../i18n"

export interface AlertDiskHighEmailProps {
  locale: Locale
  url: string
  serverName: string
  address: string
  disk: number
}

export function AlertDiskHighEmail({
  locale,
  url,
  serverName,
  address,
  disk,
}: AlertDiskHighEmailProps) {
  const t = emailTranslator(locale)
  const params = { server: serverName, disk: Math.round(disk) }

  return (
    <EmailLayout
      locale={locale}
      preview={t("alert_disk_high.preview", params)}
      t={t}
    >
      <EmailTitle>{t("alert_disk_high.title", params)}</EmailTitle>
      <EmailParagraph>{t("alert_disk_high.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName, mono: false },
          { label: t("label.address"), value: address },
          { label: t("label.disk"), value: `${Math.round(disk)} %` },
        ]}
      />
      <EmailButton url={url}>{t("alert_disk_high.cta")}</EmailButton>
      <EmailFootnote>{t("alert_disk_high.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
