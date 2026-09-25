import type { Process } from "@pupitre/shared/agent-protocol/processes";
import type { Session } from "@pupitre/shared/agent-protocol/state";
import { Screen } from "@renderer/components/ui/screen";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { TerminalAgent } from "@shared/terminals";
import { ActivityProcesses } from "./activity-processes";
import { ActivitySessions } from "./activity-sessions";

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
  /** Pids still listed by the read that followed their stop. */
  lingering: readonly number[];
  /** The rows stay those of the last successful read. */
  processesProblem: AgentError | null;
  sessions: readonly Session[];
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
