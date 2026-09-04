import type { Locale } from "../../lib/i18n"
import { EmailLayout } from "../components/layout"
import {
  EmailButton,
  EmailData,
  EmailFootnote,
  EmailParagraph,
  EmailTitle,
} from "../components/pieces"
import { emailTranslator } from "../i18n"

export interface AlertServerUnreachableEmailProps {
  locale: Locale
  url: string
  serverName: string
  address: string
  lastSeen: string
}

export function AlertServerUnreachableEmail({
  locale,
  url,
  serverName,
  address,
  lastSeen,
}: AlertServerUnreachableEmailProps) {
  const t = emailTranslator(locale)
  const params = { server: serverName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("alert_server_unreachable.preview", params)}
      t={t}
    >
      <EmailTitle>{t("alert_server_unreachable.title", params)}</EmailTitle>
      <EmailParagraph>
        {t("alert_server_unreachable.body", params)}
      </EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName, mono: false },
          { label: t("label.address"), value: address },
          { label: t("label.last_seen"), value: lastSeen, mono: false },
        ]}
      />
      <EmailButton url={url}>{t("alert_server_unreachable.cta")}</EmailButton>
      <EmailFootnote>{t("alert_server_unreachable.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
