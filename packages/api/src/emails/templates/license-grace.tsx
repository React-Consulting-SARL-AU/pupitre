import type { Locale } from "@pupitre/shared/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailData,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
} from "../components/pieces"
import { formatDate } from "../format"
import { emailTranslator } from "../i18n"

export interface LicenseGraceEmailProps {
  locale: Locale
  url: string
  organizationName: string
  deadline: Date
  serverCount: number
}

export function LicenseGraceEmail({
  locale,
  url,
  organizationName,
  deadline,
  serverCount,
}: LicenseGraceEmailProps) {
  const t = emailTranslator(locale)
  const params = {
    organization: organizationName,
    deadline: formatDate(locale, deadline),
    count: serverCount,
  }

  return (
    <EmailLayout
      locale={locale}
      preview={t("license_grace.preview", params)}
      t={t}
    >
      <EmailTitle>{t("license_grace.title", params)}</EmailTitle>
      <EmailParagraph>{t("license_grace.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          {
            label: t("label.deadline"),
            value: formatDate(locale, deadline),
            mono: false,
          },
          { label: t("label.servers"), value: String(serverCount) },
        ]}
      />
      <EmailButton url={url}>{t("license_grace.cta")}</EmailButton>
      <EmailFootnote>{t("license_grace.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
