import { AgentDot, agentStateLabel } from "@renderer/components/ui/agent-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useTerminalStatus } from "@renderer/lib/terminal-status";
import type { AgentState, TerminalKind } from "@shared/terminals";

/**
 * The line under a session: what it is, where it stands, how big it is.
 *
 * The folder is the one the shell announced through OSC 7 — an agent announces
 * none, and the bar says nothing rather than guessing. The size is the PTY's
 * own, so a program that draws to the width can be trusted to fit.
 */
export function TerminalStatusBar({
  id,
  kind,
  project,
  state,
}: {
  id: string;
  kind: TerminalKind;
  project: string | null;
  state: AgentState | undefined;
}) {
  const t = useTranslations();

  const status = useTerminalStatus(id);
  const place = project ?? t("terminals.status.server");

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-line border-t bg-surface px-3 py-1 font-data text-[11px] text-ink-3"
      data-status-bar={id}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <AgentDot state={state} />
        {state ? <span>{t(agentStateLabel(state))}</span> : null}
      </span>

      <span className="min-w-0 flex-1 truncate">
        <span className="text-ink-2">{place}</span>
        {kind === "shell" ? null : <span> · {kind}</span>}
        {status.dir ? <span> · {status.dir}</span> : null}
      </span>

      {status.cols > 0 ? (
        <span className="shrink-0 tabular-nums">
          {status.cols}×{status.rows}
        </span>
      ) : null}
    </div>
  );
}
