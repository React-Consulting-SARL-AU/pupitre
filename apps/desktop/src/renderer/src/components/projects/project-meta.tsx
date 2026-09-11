import type { ProjectGitStatusResult } from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { PROJECT_LOOK } from "@renderer/lib/project-state";
import { GitBranch } from "lucide-react";

/**
 * The state and the branch, on the line of the name.
 *
 * The branch button carries the answer to the question you actually arrive
 * with — is what runs the code I think it is — and clicking it goes to the diff.
 */
export function ProjectMeta({
  project,
  git,
  onSeeDiff,
}: {
  project: Project;
  /** Absent while the network read is in flight, or when it failed. */
  git: ProjectGitStatusResult | null;
  onSeeDiff: () => void;
}) {
  const t = useTranslations();

  return (
    <>
      <StatePill look={PROJECT_LOOK[project.state]} name={project.state} />

      {git?.repo ? (
        <button
          className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-data text-[11px] text-ink-3 tabular-nums transition-soft hover:border-line-strong hover:text-ink"
          onClick={onSeeDiff}
          title={t("project.header.seeDiff")}
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
          {git.behind > 0 ? (
            <span className="font-semibold text-ink">↓{git.behind}</span>
          ) : null}
          {git.ahead > 0 ? (
            <span className="text-ink-3">↑{git.ahead}</span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
