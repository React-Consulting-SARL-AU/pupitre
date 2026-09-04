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

export interface ServerAssignedEmailProps {
  locale: Locale
  url: string
  serverName: string
  address: string
  organizationName: string
}

export function ServerAssignedEmail({
  locale,
  url,
  serverName,
  address,
  organizationName,
}: ServerAssignedEmailProps) {
  const t = emailTranslator(locale)
  const params = { server: serverName, organization: organizationName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("server_assigned.preview", params)}
      t={t}
    >
      <EmailTitle>{t("server_assigned.title", params)}</EmailTitle>
      <EmailParagraph>{t("server_assigned.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName },
          { label: t("label.address"), value: address },
          {
            label: t("label.organization"),
            value: organizationName,
            mono: false,
          },
        ]}
      />
      <EmailButton url={url}>{t("server_assigned.cta")}</EmailButton>
      <EmailFootnote>{t("server_assigned.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
