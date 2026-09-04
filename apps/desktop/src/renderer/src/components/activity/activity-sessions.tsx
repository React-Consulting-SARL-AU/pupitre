import type { Session } from "@pupitre/shared/agent-protocol/state";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { IconButton } from "@renderer/components/ui/icon-button";
import { memory, plural, uptime } from "@renderer/lib/format";
import { Braces, Sparkles, SquareTerminal, Trash2, X } from "lucide-react";

/**
 * What outlives whatever started it.
 *
 * An agent or a remote IDE backend keeps living when its terminal disappears —
 * app closed, IntelliJ window shut — and holds its memory for nobody. A
 * JetBrains backend alone weighs several gigabytes.
 */

const HEAVY_MB = 1024;

const HEAVY_TOTAL_MB = 2048;

const KINDS: Record<Session["kind"], { label: string; icon: typeof Braces }> = {
  claude: { icon: Sparkles, label: "agent" },
  codex: { icon: Sparkles, label: "agent" },
  hermes: { icon: Sparkles, label: "agent" },
  ide: { icon: Braces, label: "éditeur distant" },
  shell: { icon: SquareTerminal, label: "shell" },
};

export function ActivitySessions({
  sessions,
  onStop,
  onClean,
}: {
  sessions: readonly Session[];
  onStop: (pid: number) => void;
  onClean: () => void;
}) {
  if (sessions.length === 0) {
    return <EmptyState title="Aucune session en arrière-plan" />;
  }

  const total = sessions.reduce((sum, session) => sum + session.ram_mb, 0);

  return (
    <div>
      <div className="flex items-center justify-between border-line border-b px-4 py-2.5">
        <span className="font-data text-[11px] text-ink-3">
          {plural(sessions.length, "session")} ·{" "}
          <span className={total > HEAVY_TOTAL_MB ? "text-warn" : ""}>
            {memory(total)}
          </span>
        </span>
        <ConfirmButton
          confirmLabel="Arrêter"
          icon={Trash2}
          onConfirm={onClean}
          question="Les sessions inactives depuis longtemps sont tuées."
          size="sm"
        >
          Arrêter celles qui traînent
        </ConfirmButton>
      </div>

      <div className="divide-y divide-line">
        {[...sessions]
          .sort((a, b) => b.ram_mb - a.ram_mb)
          .map((session) => {
            const kind = KINDS[session.kind];
            const Icon = kind.icon;

            return (
              <div
                className="flex items-center gap-3 px-4 py-3"
                key={session.pid}
              >
                <Icon
                  className="shrink-0 text-ink-3"
                  size={14}
                  strokeWidth={1.5}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px]">{session.command}</p>
                  <p className="font-data text-[10px] text-ink-3">
                    {kind.label} · pid {session.pid} · {uptime(session.seconds)}
                    {session.project ? ` · ${session.project}` : ""}
                  </p>
                </div>

                <span
                  className={`shrink-0 font-data text-[11px] tabular-nums ${
                    session.ram_mb > HEAVY_MB ? "text-warn" : "text-ink-3"
                  }`}
                >
                  {memory(session.ram_mb)}
                </span>

                <IconButton
                  icon={X}
                  label={`Arrêter la session ${session.pid}`}
                  onClick={() => onStop(session.pid)}
                  variant="danger"
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}
