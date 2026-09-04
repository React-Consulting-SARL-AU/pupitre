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

export interface ServerSuspendedEmailProps {
  locale: Locale
  url: string
  organizationName: string
  serverCount: number
}

export function ServerSuspendedEmail({
  locale,
  url,
  organizationName,
  serverCount,
}: ServerSuspendedEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName, count: serverCount }

  return (
    <EmailLayout
      locale={locale}
      preview={t("server_suspended.preview", params)}
      t={t}
    >
      <EmailTitle>{t("server_suspended.title", params)}</EmailTitle>
      <EmailParagraph>{t("server_suspended.body", params)}</EmailParagraph>
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
      <EmailButton url={url}>{t("server_suspended.cta")}</EmailButton>
      <EmailFootnote>{t("server_suspended.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
