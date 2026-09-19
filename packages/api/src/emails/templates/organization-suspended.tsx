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

export interface OrganizationSuspendedEmailProps {
  locale: Locale
  url: string
  organizationName: string
  reason: string
  serverCount: number
}

export function OrganizationSuspendedEmail({
  locale,
  url,
  organizationName,
  reason,
  serverCount,
}: OrganizationSuspendedEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName, count: serverCount }

  return (
    <EmailLayout
      locale={locale}
      preview={t("organization_suspended.preview", params)}
      t={t}
    >
      <EmailTitle>{t("organization_suspended.title", params)}</EmailTitle>
      <EmailParagraph>
        {t("organization_suspended.body", params)}
      </EmailParagraph>
      <EmailData
        fields={[
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
          { label: t("label.servers"), value: String(serverCount) },
          { label: t("label.reason"), value: reason, mono: false },
        ]}
      />
      <EmailButton url={url}>{t("organization_suspended.cta")}</EmailButton>
      <EmailFootnote>{t("organization_suspended.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
