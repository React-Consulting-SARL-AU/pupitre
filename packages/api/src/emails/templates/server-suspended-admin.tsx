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

export interface ServerSuspendedAdminEmailProps {
  locale: Locale
  url: string
  organizationName: string
  serverName: string
  address: string
  reason: string
}

export function ServerSuspendedAdminEmail({
  locale,
  url,
  organizationName,
  serverName,
  address,
  reason,
}: ServerSuspendedAdminEmailProps) {
  const t = emailTranslator(locale)
  const params = { organization: organizationName, server: serverName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("server_suspended_admin.preview", params)}
      t={t}
    >
      <EmailTitle>{t("server_suspended_admin.title", params)}</EmailTitle>
      <EmailParagraph>
        {t("server_suspended_admin.body", params)}
      </EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName },
          { label: t("label.address"), value: address },
          { label: t("label.reason"), value: reason, mono: false },
        ]}
      />
      <EmailButton url={url}>{t("server_suspended_admin.cta")}</EmailButton>
      <EmailFootnote>{t("server_suspended_admin.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
