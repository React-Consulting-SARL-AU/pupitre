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

export interface OrganizationRestoredEmailProps {
  locale: Locale
  url: string
  organizationName: string
  serverCount: number
}

export function OrganizationRestoredEmail({
  locale,
  url,
  organizationName,
  serverCount,
}: OrganizationRestoredEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName, count: serverCount }

  return (
    <EmailLayout
      locale={locale}
      preview={t("organization_restored.preview", params)}
      t={t}
    >
      <EmailTitle>{t("organization_restored.title", params)}</EmailTitle>
      <EmailParagraph>{t("organization_restored.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          { label: t("label.servers"), value: String(serverCount) },
        ]}
      />
      <EmailButton url={url}>{t("organization_restored.cta")}</EmailButton>
      <EmailFootnote>{t("organization_restored.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
