import type { ProjectGitStatusResult } from "@pupitre/shared/agent-protocol/projects";
import { Callout } from "@renderer/components/ui/callout";
import { IconButton } from "@renderer/components/ui/icon-button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import type { GitState } from "@renderer/stores/project";
import { RefreshCw } from "lucide-react";

/**
 * The gap with the remote repository, and when it was last measured.
 *
 * This is the one read in the app that leaves the machine, so it is never in a
 * refresh loop: it runs when the project opens, when a branch is taken, and
 * when the reader presses the button. The timestamp is there so nobody mistakes
 * a ten-minute-old answer for a live one.
 */

function Summary({ git }: { git: ProjectGitStatusResult }) {
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
      className={`font-data text-[12px] ${git.behind > 0 ? "font-semibold text-ink" : "text-ink-3"}`}
    >
      {git.behind > 0
        ? t("project.git.behind", {
            commits: t.plural("project.commit", git.behind),
          })
        : t("project.git.upToDate", { upstream: git.upstream })}
      {git.ahead > 0
        ? ` · ${t("project.git.ahead", { commits: t.plural("project.commit", git.ahead) })}`
        : ""}
      {git.changed > 0
        ? ` · ${t.plural("project.localChange", git.changed)}`
        : ""}
    </p>
  );
}

export function ProjectGitState({
  state,
  onCheck,
}: {
  state: GitState;
  onCheck: () => void;
}) {
  const t = useTranslations();

  if (state.status === "idle" || state.status === "reading") {
    return (
      <p className="flex items-center gap-2 font-data text-[12px] text-ink-3">
        <StatusDot shape="breathing" size={11} />
        {t("project.git.querying")}
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <Callout fix={agentText(t, state.error).fix} tone="warn">
        {agentText(t, state.error).message}
      </Callout>
    );
  }

  if (!state.git.repo) {
    return (
      <p className="font-data text-[12px] text-ink-3">
        {t("project.git.notRepo")}
      </p>
    );
  }

  return (
    <div className="rounded-sm border border-line bg-base px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <Summary git={state.git} />
          {state.git.subject ? (
            <p className="mt-1 truncate font-data text-[11px] text-ink-3">
              {t("project.git.lastCommit", { subject: state.git.subject })}
            </p>
          ) : null}
        </div>

        <span className="font-data text-[11px] text-ink-4">
          {t("project.git.readAt", { when: since(state.at) })}
        </span>
        <IconButton
          icon={RefreshCw}
          label={t("project.git.queryLabel")}
          onClick={onCheck}
          size={12}
        />
      </div>
    </div>
  );
}
