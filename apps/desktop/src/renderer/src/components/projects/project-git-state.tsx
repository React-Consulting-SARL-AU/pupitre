import type { ProjectGitStatusResult } from "@pupitre/shared/agent-protocol/projects";
import { Callout } from "@renderer/components/ui/callout";
import { IconButton } from "@renderer/components/ui/icon-button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { commits, since } from "@renderer/lib/format";
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
  if (git.problem) {
    return <Callout tone="warn">{git.problem}</Callout>;
  }

  if (!git.upstream) {
    return (
      <p className="font-data text-[11px] text-ink-3">
        aucune branche distante suivie
      </p>
    );
  }

  return (
    <p
      className={`font-data text-[11px] ${git.behind > 0 ? "font-semibold text-ink" : "text-ink-3"}`}
    >
      {git.behind > 0
        ? `${commits(git.behind)} à récupérer`
        : `à jour avec ${git.upstream}`}
      {git.ahead > 0 ? ` · ${commits(git.ahead)} à pousser` : ""}
      {git.changed > 0
        ? ` · ${git.changed} changement${git.changed > 1 ? "s" : ""} local${git.changed > 1 ? "aux" : ""}`
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
  if (state.status === "idle" || state.status === "reading") {
    return (
      <p className="flex items-center gap-2 font-data text-[11px] text-ink-3">
        <StatusDot shape="breathing" size={11} />
        interrogation du dépôt distant…
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <Callout fix={state.error.fix} tone="warn">
        {state.error.message}
      </Callout>
    );
  }

  if (!state.git.repo) {
    return (
      <p className="font-data text-[11px] text-ink-3">
        ce dossier n'est pas un dépôt git
      </p>
    );
  }

  return (
    <div className="rounded-sm border border-line bg-base px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <Summary git={state.git} />
          {state.git.subject ? (
            <p className="mt-1 truncate font-data text-[10px] text-ink-3">
              dernier : {state.git.subject}
            </p>
          ) : null}
        </div>

        <span className="font-data text-[10px] text-ink-4">
          lu {since(state.at)}
        </span>
        <IconButton
          icon={RefreshCw}
          label="Interroger le dépôt distant"
          onClick={onCheck}
          size={12}
        />
      </div>
    </div>
  );
}
