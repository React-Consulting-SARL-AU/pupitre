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

export interface AlertLicenseGraceEmailProps {
  locale: Locale
  url: string
  serverName: string
  organizationName: string
  deadline: string
}

export function AlertLicenseGraceEmail({
  locale,
  url,
  serverName,
  organizationName,
  deadline,
}: AlertLicenseGraceEmailProps) {
  const t = emailTranslator(locale)
  const params = {
    server: serverName,
    organization: organizationName,
    deadline,
  }

  return (
    <EmailLayout
      locale={locale}
      preview={t("alert_license_grace.preview", params)}
      t={t}
    >
      <EmailTitle>{t("alert_license_grace.title", params)}</EmailTitle>
      <EmailParagraph>{t("alert_license_grace.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName, mono: false },
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          { label: t("label.deadline"), value: deadline, mono: false },
        ]}
      />
      <EmailButton url={url}>{t("alert_license_grace.cta")}</EmailButton>
      <EmailFootnote>{t("alert_license_grace.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
