import type { Locale } from "../../lib/i18n"
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

export interface EntitlementGraceEmailProps {
  locale: Locale
  url: string
  organizationName: string
  deadline: Date
  serverCount: number
}

export function EntitlementGraceEmail({
  locale,
  url,
  organizationName,
  deadline,
  serverCount,
}: EntitlementGraceEmailProps) {
  const t = emailTranslator(locale)
  const params = {
    organization: organizationName,
    deadline: formatDate(locale, deadline),
    count: serverCount,
  }

  return (
    <EmailLayout
      locale={locale}
      preview={t("entitlement_grace.preview", params)}
      t={t}
    >
      <EmailTitle>{t("entitlement_grace.title", params)}</EmailTitle>
      <EmailParagraph>{t("entitlement_grace.body", params)}</EmailParagraph>
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
      <EmailButton url={url}>{t("entitlement_grace.cta")}</EmailButton>
      <EmailFootnote>{t("entitlement_grace.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
