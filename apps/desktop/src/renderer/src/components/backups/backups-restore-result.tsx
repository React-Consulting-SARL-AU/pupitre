import type { BackupRestoreDataResult } from "@pupitre/shared/agent-protocol/backup";
import { Callout } from "@renderer/components/ui/callout";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { useTranslations } from "@renderer/i18n/use-translations";

/**
 * What came back, in the agent's own account: the restore is said as the
 * success it is, and what did not come back is said once, part by part with
 * its reason, rather than as a count beside a list that repeats it.
 */
export function BackupsRestoreResult({
  result,
  headline,
}: {
  result: BackupRestoreDataResult;
  headline: string;
}) {
  const t = useTranslations();

  const missed = result.warnings.length > 0 ? result.warnings : result.failed;

  return (
    <>
      <Callout name="restore-done" tone="ok">
        {headline}
      </Callout>

      {missed.length > 0 ? (
        <Callout name="restore-missed" tone="warn">
          <p>{t.plural("backups.result.missed", missed.length)}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {missed.map((line) => (
              <li
                className="break-words font-data text-[12px] text-ink-2"
                key={line}
              >
                {line}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <Panel inset="lg">
        <FactList columns={2}>
          <Fact label={t("backups.result.restored")}>
            {result.restored.length}
          </Fact>
          <Fact
            detail={result.started.join(", ") || undefined}
            label={t("backups.result.started")}
          >
            {result.started.length}
          </Fact>
        </FactList>
      </Panel>
    </>
  );
}
