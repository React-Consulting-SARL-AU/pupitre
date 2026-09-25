import { CheckLine } from "@renderer/components/ui/check-line";
import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { JournalPane } from "@renderer/components/ui/journal-pane";
import { Section } from "@renderer/components/ui/section";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useJournal } from "@renderer/lib/use-journal";
import { useState } from "react";

// A service looping on an error writes megabytes.
const MAX_LINES = 2000;

const TAIL = 120;

export function ServiceJournal({
  serverId,
  moduleId,
  name,
}: {
  serverId: string;
  moduleId: string;
  name: string;
}) {
  const t = useTranslations();

  const [follow, setFollow] = useState(true);
  const journal = useJournal(
    (onLine) =>
      window.pupitre.followServiceJournal(serverId, moduleId, TAIL, onLine),
    `${serverId}/${moduleId}`,
    MAX_LINES
  );

  return (
    <Section
      actions={
        <>
          <CheckLine
            checked={follow}
            label={t("services.journal.follow")}
            name="service-journal-follow"
            onChange={setFollow}
            size="sm"
          />

          <CopyButton
            disabled={journal.rows.length === 0}
            onCopy={() =>
              navigator.clipboard.writeText(
                journal.rows.map((row) => row.text).join("\n")
              )
            }
          >
            {t("services.journal.copyAll")}
          </CopyButton>
        </>
      }
      aside={
        journal.rows.length > 0 ? (
          <span className="font-data text-caption text-ink-3 tabular-nums">
            {t.plural("services.journal.lines", journal.rows.length)}
          </span>
        ) : null
      }
      data-service-journal={moduleId}
      title={t("services.journal.title")}
    >
      {journal.error ? (
        <ErrorNotice error={journal.error} onRetry={journal.retry} />
      ) : null}

      <JournalPane
        className="max-h-80 rounded-md border border-line"
        follow={follow}
        label={t("services.journal.label", { name })}
        onFollowChange={setFollow}
        rows={journal.rows}
      >
        {journal.cut ? (
          <p
            className="mb-2 border-line border-b pb-2 text-caption text-ink-3"
            data-logs-cut="true"
          >
            {t("services.journal.cut", { count: MAX_LINES })}
          </p>
        ) : null}

        {journal.rows.length === 0 && !journal.error ? (
          <WaitingLine>{t("services.journal.waiting", { name })}</WaitingLine>
        ) : null}
      </JournalPane>
    </Section>
  );
}
