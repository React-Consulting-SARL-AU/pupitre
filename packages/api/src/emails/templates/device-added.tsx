import type { Locale } from "@pupitre/shared/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailData,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
} from "../components/pieces"
import { formatDateTime } from "../format"
import { emailTranslator } from "../i18n"

export interface DeviceAddedEmailProps {
  locale: Locale
  url: string
  deviceName: string
  fingerprint: string
  addedAt: Date
}

export function DeviceAddedEmail({
  locale,
  url,
  deviceName,
  fingerprint,
  addedAt,
}: DeviceAddedEmailProps) {
  const t = emailTranslator(locale)
  const params = { device: deviceName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("device_added.preview", params)}
      t={t}
    >
      <EmailTitle>{t("device_added.title", params)}</EmailTitle>
      <EmailParagraph>{t("device_added.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.device"), value: deviceName, mono: false },
          { label: t("label.fingerprint"), value: fingerprint },
          {
            label: t("label.added_at"),
            value: formatDateTime(locale, addedAt),
            mono: false,
          },
        ]}
      />
      <EmailButton url={url}>{t("device_added.cta")}</EmailButton>
      <EmailFootnote>{t("device_added.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
