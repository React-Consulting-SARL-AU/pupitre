import type { BackupContentsResult } from "@pupitre/shared/agent-protocol/backup";
import { CheckLine } from "@renderer/components/ui/check-line";
import { SwitchLine } from "@renderer/components/ui/switch";
import { useTranslations } from "@renderer/i18n/use-translations";
import { excluding } from "@renderer/lib/backups";

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
  envOnly: {
    label: string;
    detail?: string;
    value: boolean;
    onChange: (next: boolean) => void;
  } | null;
  carried: boolean;
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
          <span className="text-danger text-small">{problem}</span>
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
