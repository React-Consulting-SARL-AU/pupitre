import type { BackupContentsResult } from "@pupitre/shared/agent-protocol/backup";
import { CheckLine } from "@renderer/components/ui/check-line";
import { SwitchLine } from "@renderer/components/ui/switch";
import { useTranslations } from "@renderer/i18n/use-translations";
import { excluding } from "@renderer/lib/backups";

/**
 * The projects a backup carries: the whole category, each project the server
 * runs, and how much of them — the whole folder, or only its environment
 * files when a clone can bring the code back.
 */
export function BackupsContentProjects({
  label,
  envOnly,
  carried,
  projects,
  excluded,
  problem,
  onCarried,
  onExcluded,
}: {
  label: string;
  /** The field that keeps only the environment files, as the agent names it. */
  envOnly: {
    label: string;
    detail?: string;
    value: boolean;
    onChange: (next: boolean) => void;
  } | null;
  carried: boolean;
  /** Null until the server has said what it holds. */
  projects: BackupContentsResult["projects"] | null;
  excluded: readonly string[];
  problem?: string;
  onCarried: (next: boolean) => void;
  onExcluded: (next: string[]) => void;
}) {
  const t = useTranslations();

  const listed = new Set((projects ?? []).map((one) => one.name));
  const gone = excluded.filter((name) => !listed.has(name));

  return (
    <div className="flex flex-col gap-3" data-backup-content="projects">
      <SwitchLine
        checked={carried}
        detail={t("backups.contents.projectsDetail")}
        label={label}
        name="backup-projects"
        onChange={onCarried}
      />

      <div className="flex flex-col gap-2 border-line border-l pl-4">
        {(projects ?? []).map((project) => (
          <CheckLine
            checked={!excluded.includes(project.name)}
            detail={project.repo ? undefined : t("backups.contents.noRepo")}
            disabled={!carried}
            key={project.name}
            label={project.name}
            name={`backup-project-${project.name}`}
            onChange={(next) =>
              onExcluded(excluding(excluded, project.name, next))
            }
          />
        ))}

        {gone.map((name) => (
          <CheckLine
            checked={false}
            detail={t("backups.contents.gone")}
            disabled={!carried}
            key={name}
            label={name}
            name={`backup-project-${name}`}
            onChange={(next) => onExcluded(excluding(excluded, name, next))}
          />
        ))}

        {problem ? (
          <span className="text-[12px] text-danger">{problem}</span>
        ) : null}

        {envOnly ? (
          <div className="pt-2">
            <SwitchLine
              checked={envOnly.value}
              detail={envOnly.detail}
              disabled={!carried}
              label={envOnly.label}
              name="backup-projects-env-only"
              onChange={envOnly.onChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
