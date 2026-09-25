import type { ProjectGitStatusResult } from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { StatePill } from "@renderer/components/ui/state-pill";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { useTranslations } from "@renderer/i18n/use-translations";
import { PROJECT_LOOK } from "@renderer/lib/project-state";
import { GitBranch } from "lucide-react";

export function ProjectMeta({
  project,
  git,
  onSeeDiff,
}: {
  project: Project;
  git: ProjectGitStatusResult | null;
  onSeeDiff: () => void;
}) {
  const t = useTranslations();

  return (
    <>
      <StatePill look={PROJECT_LOOK[project.state]} name={project.state} />

      {git?.repo ? (
        <Tooltip label={t("project.header.seeDiff")}>
          <button
            className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-data text-caption text-ink-3 tabular-nums transition-soft hover:border-line-strong hover:text-ink"
            onClick={onSeeDiff}
            type="button"
          >
            <GitBranch size={10} strokeWidth={1.5} />
            <span className="max-w-[14rem] truncate">{git.current}</span>
            {git.changed > 0 ? (
              <span className="text-warn">
                {t.plural("project.change", git.changed)}
              </span>
            ) : (
              <span className="text-ok">{t("project.clean")}</span>
            )}
          </button>
        </Tooltip>
      ) : null}
    </>
  );
}
