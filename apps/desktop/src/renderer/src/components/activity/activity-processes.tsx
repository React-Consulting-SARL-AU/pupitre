import type { Process } from "@pupitre/shared/agent-protocol/processes";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory } from "@renderer/lib/format";
import type { AgentError } from "@shared/agent";
import { OctagonX, X } from "lucide-react";

/**
 * What weighs on the machine, heaviest first.
 *
 * "It's slow" cannot be fixed without knowing what is slow: each row therefore
 * carries the project responsible when the agent managed to find it, rather
 * than an anonymous "java" nobody could attribute.
 *
 * A stop that did not take — the process is still listed at the next read —
 * turns its button into a forced one: the first asks, the second does not.
 */

const BUSY_CPU = 50;

const HEAVY_MB = 2048;

export function ActivityProcesses({
  processes,
  lingering = [],
  problem = null,
  onStop,
  onRetry,
}: {
  processes: readonly Process[];
  /** The pids a stop was sent to and that are still here. */
  lingering?: readonly number[];
  /** The last read that failed, while the rows are the read before it. */
  problem?: AgentError | null;
  onStop: (pid: number, force: boolean) => void;
  onRetry?: () => void;
}) {
  const t = useTranslations();

  if (problem) {
    return (
      <div className="p-4" data-processes="failed">
        <ErrorNotice error={problem} onRetry={onRetry} />
      </div>
    );
  }

  if (processes.length === 0) {
    return <EmptyState title={t("activity.processes.empty")} />;
  }

  const peak = Math.max(...processes.map((p) => p.cpu), 1);

  return (
    <div className="divide-y divide-line">
      {processes.map((process) => (
        <div className="flex items-center gap-3 px-4 py-3" key={process.pid}>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-medium text-[13px]">
                {process.command}
              </span>
              {process.project ? (
                <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-0.5 font-data text-[11px] text-ink-2">
                  {process.project}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-ink-3 transition-size"
                style={{ width: `${Math.max(2, (process.cpu / peak) * 100)}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 text-right font-data text-[12px] tabular-nums">
            <div
              className={process.cpu > BUSY_CPU ? "text-warn" : "text-ink-2"}
            >
              {process.cpu.toFixed(0)} %
            </div>
            <div
              className={process.ram_mb > HEAVY_MB ? "text-warn" : "text-ink-3"}
            >
              {memory(process.ram_mb)}
            </div>
          </div>

          {lingering.includes(process.pid) ? (
            <ConfirmButton
              confirmLabel={t("activity.force")}
              icon={OctagonX}
              onConfirm={() => onStop(process.pid, true)}
              question={t("activity.process.forceQuestion", {
                command: process.command,
                pid: process.pid,
              })}
              size="sm"
            >
              {t("activity.force")}
            </ConfirmButton>
          ) : (
            <ConfirmButton
              confirmLabel={t("activity.stop")}
              icon={X}
              onConfirm={() => onStop(process.pid, false)}
              question={t("activity.process.question", {
                command: process.command,
                pid: process.pid,
              })}
              size="sm"
            >
              {t("activity.stop")}
            </ConfirmButton>
          )}
        </div>
      ))}
    </div>
  );
}
