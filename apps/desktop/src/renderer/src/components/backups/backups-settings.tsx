import type { Manifest } from "@pupitre/shared/catalog";
import { ServiceConfigFooter } from "@renderer/components/services/service-config-footer";
import { ServiceConfigOutcome } from "@renderer/components/services/service-config-outcome";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { problemText, strayProblems } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { driftsFrom } from "@renderer/lib/backup-providers";
import { CONTENT_FIELDS, FREQUENCY_FIELDS } from "@renderer/lib/backup-setup";
import { useBackupConnection } from "@renderer/stores/backup-connection";
import type { ContentsState } from "@renderer/stores/backups";
import { useServices } from "@renderer/stores/services";
import { BackupsContentFields } from "./backups-content-fields";
import { BackupsFrequencyFields } from "./backups-frequency-fields";

export type BackupsSettingsPane = "frequency" | "content";

const PANE_FIELDS: Record<BackupsSettingsPane, readonly string[]> = {
  content: CONTENT_FIELDS,
  frequency: FREQUENCY_FIELDS,
};

export function BackupsSettings({
  pane,
  serverId,
  manifest,
  contents,
  nameOf,
  onRetryContents,
}: {
  pane: BackupsSettingsPane;
  serverId: string;
  manifest: Manifest;
  contents: ContentsState;
  nameOf: (moduleId: string) => string;
  onRetryContents: () => Promise<void>;
}) {
  const t = useTranslations();

  const store = useServices();
  const held = useBackupConnection((state) => state.held);
  const { config, apply, values, steps } = store;

  if (config.status === "failed") {
    return <ErrorNotice error={config.error} />;
  }

  if (config.status !== "ready") {
    return <SkeletonRows framed rows={4} />;
  }

  const shown = store.shown();
  const stray = strayProblems(t, shown, PANE_FIELDS[pane], manifest);
  const view = held.status === "read" ? held.view : null;
  const drifting = view !== null && driftsFrom(view, config.baseline);
  const running = apply.status === "running";

  function problemOf(key: string): string | undefined {
    const found = shown.find((problem) => problem.field === key);

    return found ? problemText(t, found) : undefined;
  }

  // Both panes share one draft of core.backup, so Apply also sends the other pane's changes.
  function applyAll(): Promise<void> {
    return store.reconfigure(serverId, manifest.id);
  }

  const outcome = (
    <ServiceConfigOutcome
      apply={apply}
      name={manifest.name}
      nameOf={nameOf}
      secretsDropped={store.secretsDropped}
      steps={steps}
    />
  );

  const frequency = pane === "frequency";

  return (
    <form
      className="flex flex-col gap-section"
      data-backup-settings={pane}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        applyAll();
      }}
    >
      <Section
        name={frequency ? "backup-schedule" : "backup-contents"}
        title={t(
          frequency ? "backups.schedule.title" : "backups.contents.title"
        )}
      >
        <Panel className="flex flex-col" inset="none">
          <div className="p-6">
            {frequency ? (
              <BackupsFrequencyFields
                onValue={store.setValue}
                problemOf={problemOf}
                values={values}
              />
            ) : (
              <BackupsContentFields
                contents={contents}
                manifest={manifest}
                onRetryContents={onRetryContents}
                problemOf={problemOf}
              />
            )}
          </div>

          <ServiceConfigFooter
            applicable={drifting}
            dirty={store.dirty()}
            onDiscard={() => store.discard(serverId)}
            refused={shown.filter((problem) => problem.field !== "").length}
            running={running}
            stray={stray}
          />
        </Panel>
      </Section>

      {outcome}
    </form>
  );
}
