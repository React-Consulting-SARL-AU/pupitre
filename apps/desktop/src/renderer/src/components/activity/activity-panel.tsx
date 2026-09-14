import type { Process } from "@pupitre/shared/agent-protocol/processes";
import type { Session } from "@pupitre/shared/agent-protocol/state";
import { Screen } from "@renderer/components/ui/screen";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { TerminalAgent } from "@shared/terminals";
import { ActivityProcesses } from "./activity-processes";
import { ActivitySessions } from "./activity-sessions";

/**
 * What runs on the machine right now: the processes, then what outlives them.
 *
 * `processes.list` costs a full `ps`, so it is read on a slower beat than the
 * snapshot. The sessions come with the snapshot itself and cost nothing more.
 */
export function ActivityPanel({
  serverName,
  processes,
  lingering,
  processesProblem,
  sessions,
  attached,
  onStopProcess,
  onRetryProcesses,
  onStopSession,
  onCleanSessions,
  onReattach,
}: {
  serverName: string;
  processes: readonly Process[];
  /** The pids a stop was sent to and that the next read still listed. */
  lingering: readonly number[];
  /** The last `processes.list` that failed, while the rows are the read before it. */
  processesProblem: AgentError | null;
  sessions: readonly Session[];
  /** The sessions the app still has a tab on. */
  attached: readonly string[];
  onStopProcess: (pid: number, force: boolean) => void;
  onRetryProcesses: () => void;
  onStopSession: (pid: number) => void;
  onCleanSessions: () => void;
  onReattach: (project: string, kind: TerminalAgent) => void;
}) {
  const t = useTranslations();

  return (
    <Screen eyebrow={serverName} title={t("activity.title")}>
      <ActivityProcesses
        lingering={lingering}
        onRetry={onRetryProcesses}
        onStop={onStopProcess}
        problem={processesProblem}
        processes={processes}
      />

      <ActivitySessions
        attached={attached}
        onClean={onCleanSessions}
        onReattach={onReattach}
        onStop={onStopSession}
        sessions={sessions}
      />
    </Screen>
  );
}
