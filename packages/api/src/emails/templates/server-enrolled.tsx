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

export interface ServerEnrolledEmailProps {
  locale: Locale
  url: string
  serverName: string
  address: string
  agentVersion: string
  arch: string
  hostFingerprint: string | null
}

export function ServerEnrolledEmail({
  locale,
  url,
  serverName,
  address,
  agentVersion,
  arch,
  hostFingerprint,
}: ServerEnrolledEmailProps) {
  const t = emailTranslator(locale)
  const params = { server: serverName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("server_enrolled.preview", params)}
      t={t}
    >
      <EmailTitle>{t("server_enrolled.title", params)}</EmailTitle>
      <EmailParagraph>{t("server_enrolled.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.address"), value: address },
          { label: t("label.agent_version"), value: agentVersion },
          { label: t("label.architecture"), value: arch },
          ...(hostFingerprint
            ? [{ label: t("label.fingerprint"), value: hostFingerprint }]
            : []),
        ]}
      />
      <EmailButton url={url}>{t("server_enrolled.cta")}</EmailButton>
      <EmailFootnote>{t("server_enrolled.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
