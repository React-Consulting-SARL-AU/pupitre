import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { IconButton } from "@renderer/components/ui/icon-button";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import { heldForUsage } from "@renderer/lib/refusals";
import type { GitState } from "@renderer/stores/project";
import { Download, RotateCw } from "lucide-react";
import { ProjectGitSummary } from "./project-git-summary";

// The only read that leaves the machine: never on a timer, and stamped so an old answer is not taken as live.
export function ProjectGitState({
  state,
  onCheck,
  onPull,
  pulling = false,
}: {
  state: GitState;
  onCheck: () => void;
  onPull?: () => void;
  pulling?: boolean;
}) {
  const t = useTranslations();

  if (state.status === "idle" || state.status === "reading") {
    return (
      <WaitingLine className="font-data text-small">
        {t("project.git.querying")}
      </WaitingLine>
    );
  }

  if (state.status === "failed") {
    return heldForUsage(state.error) ? null : (
      <div className="border-line border-t pt-3">
        <ErrorNotice bare error={state.error} onRetry={onCheck} />
      </div>
    );
  }

  if (!state.git.repo) {
    return (
      <p className="font-data text-ink-3 text-small">
        {t("project.git.notRepo")}
      </p>
    );
  }

  return (
    <div className="border-line border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <ProjectGitSummary git={state.git} />
          <p className="mt-1 truncate font-data text-caption text-ink-3">
            {state.git.subject
              ? `${t("project.git.lastCommit", { subject: state.git.subject })} · `
              : ""}
            {t("project.git.readAt", { when: since(state.at) })}
          </p>
        </div>

        {state.git.behind > 0 && onPull ? (
          <Button
            icon={Download}
            loading={pulling}
            onClick={onPull}
            size="sm"
            variant="inverse"
          >
            {t("project.git.pull")}
          </Button>
        ) : null}
        <IconButton
          icon={RotateCw}
          label={t("project.git.queryLabel")}
          onClick={onCheck}
          size={12}
        />
      </div>
    </div>
  );
}
