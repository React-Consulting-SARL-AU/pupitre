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

export interface AlertAgentOutdatedEmailProps {
  locale: Locale
  url: string
  serverName: string
  agentVersion: string
  latestVersion: string
}

export function AlertAgentOutdatedEmail({
  locale,
  url,
  serverName,
  agentVersion,
  latestVersion,
}: AlertAgentOutdatedEmailProps) {
  const t = emailTranslator(locale)
  const params = {
    server: serverName,
    current: agentVersion,
    version: latestVersion,
  }

  return (
    <EmailLayout
      locale={locale}
      preview={t("alert_agent_outdated.preview", params)}
      t={t}
    >
      <EmailTitle>{t("alert_agent_outdated.title", params)}</EmailTitle>
      <EmailParagraph>{t("alert_agent_outdated.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName, mono: false },
          { label: t("label.agent_version"), value: agentVersion },
          { label: t("label.latest_version"), value: latestVersion },
        ]}
      />
      <EmailButton url={url}>{t("alert_agent_outdated.cta")}</EmailButton>
      <EmailFootnote>{t("alert_agent_outdated.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
