import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import { choiceOf } from "@renderer/lib/backup-schedule";
import { dated, weight } from "@renderer/lib/format";
import type { StatusState } from "@renderer/stores/backups";

/** The interval in the words the settings choose it with. */
function frequencyLabel(t: Translate, interval: number): string {
  const choice = choiceOf(interval);

  return choice === "custom"
    ? t.plural("backups.status.hours", interval)
    : t(`backups.frequency.choice.${choice}`);
}

/** Where this server's backups stand, in the agent's own words. */
export function BackupsStatus({
  state,
  docker,
  onRetry,
}: {
  state: StatusState;
  /** Docker runs here, and its volumes are not in any backup. */
  docker: boolean;
  onRetry: () => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <Section name="backup-status" title={t("backups.status.title")}>
      {state.status === "loading" || state.status === "idle" ? (
        <SkeletonRows rows={2} />
      ) : null}

      {state.status === "failed" ? (
        <ErrorNotice error={state.error} onRetry={onRetry} />
      ) : null}

      {state.status === "read" ? (
        <>
          {state.backup.running ? (
            <Callout name="backup-running">
              {t("backups.status.running")}
            </Callout>
          ) : null}

          <Panel inset="lg">
            <FactList columns={3}>
              <Fact
                detail={
                  state.backup.last && !state.backup.last.ok
                    ? state.backup.last.error
                    : undefined
                }
                label={t("backups.status.last")}
              >
                {state.backup.last
                  ? t(
                      state.backup.last.ok
                        ? "backups.status.lastOk"
                        : "backups.status.lastFailed",
                      {
                        date: dated(state.backup.last.at),
                        weight: weight(state.backup.last.bytes ?? 0),
                      }
                    )
                  : t("backups.status.never")}
              </Fact>
              <Fact label={t("backups.status.next")}>
                {state.backup.next_run_at
                  ? dated(state.backup.next_run_at)
                  : t("backups.status.onDemand")}
              </Fact>
              <Fact
                detail={t.plural("backups.status.keep", state.backup.keep)}
                label={t("backups.status.every")}
              >
                {frequencyLabel(t, state.backup.interval_hours)}
              </Fact>
            </FactList>
          </Panel>

          {state.backup.last?.ok && state.backup.last.warnings?.length ? (
            <Callout name="backup-incomplete" tone="warn">
              <p>
                {t.plural(
                  "backups.status.incomplete",
                  state.backup.last.warnings.length
                )}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {state.backup.last.warnings.map((warning) => (
                  <li
                    className="break-words font-data text-ink-2 text-small"
                    key={warning}
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            </Callout>
          ) : null}
        </>
      ) : null}

      {docker ? (
        <Callout name="backup-docker" tone="warn">
          {t("backups.status.docker")}
        </Callout>
      ) : null}
    </Section>
  );
}
