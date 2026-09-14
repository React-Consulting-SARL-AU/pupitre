import type { ProjectGitStatusResult } from "@pupitre/shared/agent-protocol/projects";
import { Callout } from "@renderer/components/ui/callout";
import { useTranslations } from "@renderer/i18n/use-translations";

/** The gap with the upstream in one line: behind, ahead, and what is not committed. */
export function ProjectGitSummary({ git }: { git: ProjectGitStatusResult }) {
  const t = useTranslations();

  if (git.problem) {
    return <Callout tone="warn">{git.problem}</Callout>;
  }

  if (!git.upstream) {
    return (
      <p className="font-data text-[12px] text-ink-3">
        {t("project.git.noUpstream")}
      </p>
    );
  }

  return (
    <p
      className={`font-data text-[12px] ${git.behind > 0 ? "text-ink" : "text-ink-3"}`}
    >
      {git.behind > 0
        ? t("project.git.behind", {
            commits: t.plural("project.commit", git.behind),
          })
        : t("project.git.upToDate", { upstream: git.upstream })}
      {git.ahead > 0
        ? ` · ${t("project.git.ahead", { commits: t.plural("project.commit", git.ahead) })}`
        : ""}
    </p>
  );
}
