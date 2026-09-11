import type { Process } from "@pupitre/shared/agent-protocol/processes";
import type { Session } from "@pupitre/shared/agent-protocol/state";
import { Label } from "@renderer/components/ui/label";
import { Screen } from "@renderer/components/ui/screen";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import type { TerminalAgent } from "@shared/terminals";
import { Activity, Sparkles } from "lucide-react";
import { ActivityProcesses } from "./activity-processes";
import { ActivitySessions } from "./activity-sessions";

/**
 * What runs on the machine right now: the processes, then what outlives them.
 *
 * `processes.list` costs a full `ps`, so it is read on a slower beat than the
 * snapshot. The sessions come with the snapshot itself and cost nothing more.
 */
export function ActivityPanel({
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
    <Screen eyebrow={t("activity.eyebrow")} title={t("activity.title")}>
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-ink-3">
          <Activity size={12} strokeWidth={1.5} />
          <Label>{t("activity.weighs")}</Label>
        </h2>
        <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
          <ActivityProcesses
            lingering={lingering}
            onRetry={onRetryProcesses}
            onStop={onStopProcess}
            problem={processesProblem}
            processes={processes}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-ink-3">
          <Sparkles size={12} strokeWidth={1.5} />
          <Label>{t("activity.sessions.title")}</Label>
        </h2>
        <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
          <ActivitySessions
            attached={attached}
            onClean={onCleanSessions}
            onReattach={onReattach}
            onStop={onStopSession}
            sessions={sessions}
          />
        </div>
      </section>
    </Screen>
  );
}
