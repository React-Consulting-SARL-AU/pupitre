import type { Field, Manifest } from "@pupitre/shared/catalog";
import { ConfigFieldControl } from "@renderer/components/config/config-field-control";
import { ServiceConfigFooter } from "@renderer/components/services/service-config-footer";
import { ServiceConfigOutcome } from "@renderer/components/services/service-config-outcome";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { SwitchLine } from "@renderer/components/ui/switch";
import { problemText } from "@renderer/i18n/field-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { listOf } from "@renderer/lib/backups";
import type { ContentsState } from "@renderer/stores/backups";
import { useServices } from "@renderer/stores/services";
import { BackupsContentDatabases } from "./backups-content-databases";
import { BackupsContentProjects } from "./backups-content-projects";

const SCHEDULE = ["interval_hours", "hour", "keep"] as const;

/**
 * `core.backup`'s settings, drawn for what they mean: when backups run and how
 * many stay, then what they carry — the categories and, inside them, each
 * database and project the server holds. Everything goes by default; unticking
 * an item puts it in the module's exclusion list. One draft of the module's
 * configuration, one Apply at the foot, the same store the services page uses.
 */
export function BackupsSettings({
  serverId,
  manifest,
  contents,
  configured,
  nameOf,
  onRetryContents,
}: {
  serverId: string;
  manifest: Manifest;
  contents: ContentsState;
  configured: boolean;
  nameOf: (moduleId: string) => string;
  onRetryContents: () => Promise<void>;
}) {
  const t = useTranslations();

  const store = useServices();
  const { config, apply, values, steps } = store;

  if (config.status === "failed") {
    return <ErrorNotice error={config.error} />;
  }

  if (config.status !== "ready") {
    return <SkeletonRows framed rows={4} />;
  }

  const moduleId = manifest.id;
  const refused = store.shown().filter((problem) => problem.field !== "");
  const running = apply.status === "running";
  const read = contents.status === "read" ? contents.contents : null;

  function fieldOf(key: string): Field | undefined {
    return manifest.fields.find((field) => field.key === key);
  }

  function problemOf(key: string): string | undefined {
    const problem = refused.find((one) => one.field === key);

    return problem ? problemText(t, problem) : undefined;
  }

  function control(key: string) {
    const field = fieldOf(key);

    return field ? (
      <ConfigFieldControl
        field={field}
        handlers={{ onValue: store.setValue }}
        held={config.status === "ready" ? config.held : []}
        key={key}
        moduleId={moduleId}
        problem={problemOf(key)}
        value={values[key]}
      />
    ) : null;
  }

  const set = (key: string) => (next: unknown) => store.setValue(key, next);
  const home = fieldOf("home");
  const envOnly = fieldOf("projects_env_only");

  return (
    <form
      className="flex flex-col gap-section"
      data-backup-settings=""
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        store.reconfigure(serverId, moduleId);
      }}
    >
      <Section name="backup-schedule" title={t("backups.schedule.title")}>
        <Panel className="grid gap-6 sm:grid-cols-3" inset="lg">
          {SCHEDULE.map(control)}
        </Panel>
      </Section>

      <Section name="backup-contents" title={t("backups.contents.title")}>
        <Panel className="flex flex-col" inset="none">
          <div className="flex flex-col gap-6 p-6">
            {contents.status === "loading" ? <SkeletonRows rows={3} /> : null}

            {contents.status === "failed" ? (
              <ErrorNotice
                bare
                error={contents.error}
                onRetry={onRetryContents}
              />
            ) : null}

            {fieldOf("databases") ? (
              <BackupsContentDatabases
                carried={values.databases !== false}
                databases={read?.databases ?? null}
                excluded={listOf(values.exclude_databases)}
                label={fieldOf("databases")?.label ?? ""}
                onCarried={set("databases")}
                onExcluded={set("exclude_databases")}
                problem={problemOf("exclude_databases")}
                unreadable={read?.unreadable ?? []}
              />
            ) : null}

            {fieldOf("projects") ? (
              <BackupsContentProjects
                carried={values.projects !== false}
                envOnly={
                  envOnly
                    ? {
                        detail: envOnly.help,
                        label: envOnly.label,
                        onChange: set("projects_env_only"),
                        value: values.projects_env_only === true,
                      }
                    : null
                }
                excluded={listOf(values.exclude_projects)}
                label={fieldOf("projects")?.label ?? ""}
                onCarried={set("projects")}
                onExcluded={set("exclude_projects")}
                problem={problemOf("exclude_projects")}
                projects={read?.projects ?? null}
              />
            ) : null}

            {home ? (
              <SwitchLine
                checked={values.home !== false}
                detail={home.help}
                label={home.label}
                name="backup-home"
                onChange={set("home")}
              />
            ) : null}

            {control("extra_paths")}
          </div>

          <ServiceConfigFooter
            applicable={!configured}
            dirty={store.dirty()}
            onDiscard={() => store.discard(serverId)}
            refused={refused.length}
            running={running}
          />
        </Panel>
      </Section>

      <ServiceConfigOutcome
        apply={apply}
        name={manifest.name}
        nameOf={nameOf}
        secretsDropped={store.secretsDropped}
        steps={steps}
      />
    </form>
  );
}
