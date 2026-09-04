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

export interface ServerDecommissionEmailProps {
  locale: Locale
  url: string
  serverName: string
  organizationName: string
  deadline: Date
}

export function ServerDecommissionEmail({
  locale,
  url,
  serverName,
  organizationName,
  deadline,
}: ServerDecommissionEmailProps) {
  const t = emailTranslator(locale)
  const params = {
    server: serverName,
    organization: organizationName,
    deadline: formatDate(locale, deadline),
  }

  return (
    <EmailLayout
      locale={locale}
      preview={t("server_decommission.preview", params)}
      t={t}
    >
      <EmailTitle>{t("server_decommission.title", params)}</EmailTitle>
      <EmailParagraph>{t("server_decommission.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName },
          {
            label: t("label.erased_on"),
            value: formatDate(locale, deadline),
            mono: false,
          },
        ]}
      />
      <EmailButton url={url}>{t("server_decommission.cta")}</EmailButton>
      <EmailFootnote>{t("server_decommission.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
