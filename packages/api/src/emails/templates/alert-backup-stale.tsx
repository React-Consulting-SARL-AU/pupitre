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

export interface AlertBackupStaleEmailProps {
  locale: Locale
  url: string
  serverName: string
  lastOk: string
  intervalHours: number
}

export function AlertBackupStaleEmail({
  locale,
  url,
  serverName,
  lastOk,
  intervalHours,
}: AlertBackupStaleEmailProps) {
  const t = emailTranslator(locale)
  const params = { server: serverName }

  return (
    <EmailLayout
      locale={locale}
      preview={t("alert_backup_stale.preview", params)}
      t={t}
    >
      <EmailTitle>{t("alert_backup_stale.title", params)}</EmailTitle>
      <EmailParagraph>{t("alert_backup_stale.body", params)}</EmailParagraph>
      <EmailData
        fields={[
          { label: t("label.server"), value: serverName, mono: false },
          { label: t("label.last_ok"), value: lastOk, mono: false },
          { label: t("label.interval"), value: `${intervalHours} h` },
        ]}
      />
      <EmailButton url={url}>{t("alert_backup_stale.cta")}</EmailButton>
      <EmailFootnote>{t("alert_backup_stale.footnote")}</EmailFootnote>
    </EmailLayout>
  )
}
