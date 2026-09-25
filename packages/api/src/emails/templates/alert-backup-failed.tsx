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

export interface AlertBackupFailedEmailProps {
  locale: Locale
  url: string
  serverName: string
  lastError: string | null
  /** Above zero with no error: the backup exists but is incomplete. */
  missing: number
  lastRun: string
}

export function AlertBackupFailedEmail({
  locale,
  url,
  serverName,
  lastError,
  missing,
  lastRun,
}: AlertBackupFailedEmailProps) {
  const t = emailTranslator(locale)
  const params = { server: serverName }
  const incomplete = !lastError && missing > 0
  const words = incomplete ? "alert_backup_incomplete" : "alert_backup_failed"

  const fields = [
    { label: t("label.server"), value: serverName, mono: false },
    { label: t("label.last_run"), value: lastRun, mono: false },
    incomplete
      ? { label: t("label.missing_parts"), value: String(missing) }
      : { label: t("label.last_error"), value: lastError ?? "—" },
  ]

  return (
    <EmailLayout locale={locale} preview={t(`${words}.preview`, params)} t={t}>
      <EmailTitle>{t(`${words}.title`, params)}</EmailTitle>
      <EmailParagraph>{t(`${words}.body`, params)}</EmailParagraph>
      <EmailData fields={fields} />
      <EmailButton url={url}>{t("alert_backup_failed.cta")}</EmailButton>
      <EmailFootnote>{t(`${words}.footnote`)}</EmailFootnote>
    </EmailLayout>
  )
}
