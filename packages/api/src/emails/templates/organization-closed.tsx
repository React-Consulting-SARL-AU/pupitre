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

export interface OrganizationClosedEmailProps {
  locale: Locale
  url: string
  organizationName: string
  reason: string
}

export function OrganizationClosedEmail({
  locale,
  url,
  organizationName,
  reason,
}: OrganizationClosedEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("organization_closed.preview", params)}
      t={t}
    >
      <EmailTitle>{t("organization_closed.title", params)}</EmailTitle>
      <EmailParagraph>{t("organization_closed.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          { label: t("label.reason"), value: reason, mono: false },
        ]}
      />
      <EmailButton url={url}>{t("organization_closed.cta")}</EmailButton>
      <EmailFootnote>{t("organization_closed.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
