import type { Process } from "@pupitre/shared/agent-protocol/processes";
import type { Session } from "@pupitre/shared/agent-protocol/state";
import { Label } from "@renderer/components/ui/label";
import { PageHeader } from "@renderer/components/ui/page-header";
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
  sessions,
  onStopProcess,
  onStopSession,
  onCleanSessions,
}: {
  processes: readonly Process[];
  sessions: readonly Session[];
  onStopProcess: (pid: number, what: string) => void;
  onStopSession: (pid: number) => void;
  onCleanSessions: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <PageHeader
          description="Ce qui pèse sur la machine, et ce qui continue quand vous fermez la fenêtre."
          eyebrow="Serveur"
          title="Processus et sessions"
        />

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-ink-3">
            <Activity size={12} strokeWidth={1.5} />
            <Label>Ce qui pèse</Label>
          </h2>
          <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
            <ActivityProcesses onStop={onStopProcess} processes={processes} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-ink-3">
            <Sparkles size={12} strokeWidth={1.5} />
            <Label>Sessions en arrière-plan</Label>
          </h2>
          <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
            <ActivitySessions
              onClean={onCleanSessions}
              onStop={onStopSession}
              sessions={sessions}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
