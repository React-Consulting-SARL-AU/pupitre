import type { Manifest } from "@pupitre/shared/catalog";
import { ConfigFieldControl } from "@renderer/components/config/config-field-control";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { SwitchLine } from "@renderer/components/ui/switch";
import { listOf } from "@renderer/lib/backups";
import type { ContentsState } from "@renderer/stores/backups";
import { useServices } from "@renderer/stores/services";
import { BackupsContentDatabases } from "./backups-content-databases";
import { BackupsContentProjects } from "./backups-content-projects";

const NONE_HELD: readonly string[] = [];

/**
 * What backups carry, as the server holds it: the databases and the projects
 * one by one, the dev account, and any other folder. Everything goes by
 * default; unticking an item puts it in the module's exclusion list.
 */
export function BackupsContentFields({
  manifest,
  contents,
  problemOf,
  onRetryContents,
}: {
  manifest: Manifest;
  contents: ContentsState;
  problemOf: (key: string) => string | undefined;
  onRetryContents: () => Promise<void>;
}) {
  const values = useServices((state) => state.values);
  const setValue = useServices((state) => state.setValue);
  const held = useServices((state) =>
    state.config.status === "ready" ? state.config.held : NONE_HELD
  );

  const read = contents.status === "read" ? contents.contents : null;

  function fieldOf(key: string) {
    return manifest.fields.find((field) => field.key === key);
  }

  const set = (key: string) => (next: unknown) => setValue(key, next);
  const databases = fieldOf("databases");
  const projects = fieldOf("projects");
  const envOnly = fieldOf("projects_env_only");
  const home = fieldOf("home");
  const extra = fieldOf("extra_paths");

  return (
    <div className="flex flex-col gap-6" data-backup-content-fields="">
      {contents.status === "loading" ? <SkeletonRows rows={3} /> : null}

      {contents.status === "failed" ? (
        <ErrorNotice bare error={contents.error} onRetry={onRetryContents} />
      ) : null}

      {databases ? (
        <BackupsContentDatabases
          carried={values.databases !== false}
          databases={read?.databases ?? null}
          excluded={listOf(values.exclude_databases)}
          label={databases.label}
          onCarried={set("databases")}
          onExcluded={set("exclude_databases")}
          problem={problemOf("exclude_databases")}
          unreadable={read?.unreadable ?? []}
        />
      ) : null}

      {projects ? (
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
          label={projects.label}
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

      {extra ? (
        <ConfigFieldControl
          field={extra}
          handlers={{ onValue: setValue }}
          held={held}
          moduleId={manifest.id}
          problem={problemOf("extra_paths")}
          value={values.extra_paths}
        />
      ) : null}
    </div>
  );
}
