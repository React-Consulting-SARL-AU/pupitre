import type { BackupRestoreDataResult } from "@pupitre/shared/agent-protocol/backup";
import { Callout } from "@renderer/components/ui/callout";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { useTranslations } from "@renderer/i18n/use-translations";

/** What came back, what did not, and the projects now running — the agent's own account of the data. */
export function BackupsRestoreResult({
  result,
  headline,
}: {
  result: BackupRestoreDataResult;
  headline: string;
}) {
  const t = useTranslations();

  return (
    <>
      <Callout tone={result.failed.length > 0 ? "warn" : "ok"}>
        {headline}
      </Callout>

      {result.warnings.map((warning) => (
        <Callout key={warning} tone="warn">
          {warning}
        </Callout>
      ))}

      <Panel inset="lg">
        <FactList columns={3}>
          <Fact label={t("backups.result.restored")}>
            {result.restored.length}
          </Fact>
          <Fact
            detail={result.failed.join(", ") || undefined}
            label={t("backups.result.failed")}
          >
            {result.failed.length}
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
