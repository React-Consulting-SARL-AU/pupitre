import type { Locale } from "@pupitre/shared/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailData,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
} from "../components/pieces"
import { emailTranslator } from "../i18n"

export interface SeatsDriftEmailProps {
  locale: Locale
  url: string
  organizationName: string
  paid: number
  seated: number
}

export function SeatsDriftEmail({
  locale,
  url,
  organizationName,
  paid,
  seated,
}: SeatsDriftEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName, paid, seated }

  return (
    <EmailLayout
      locale={locale}
      preview={t("seats_drift.preview", params)}
      t={t}
    >
      <EmailTitle>{t("seats_drift.title", params)}</EmailTitle>
      <EmailParagraph>{t("seats_drift.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          { label: t("label.seats_paid"), value: String(paid) },
          { label: t("label.servers"), value: String(seated) },
        ]}
      />
      <EmailButton url={url}>{t("seats_drift.cta")}</EmailButton>
      <EmailFootnote>{t("seats_drift.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
