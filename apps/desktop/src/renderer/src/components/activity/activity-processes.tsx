import type { Process } from "@pupitre/shared/agent-protocol/processes";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory } from "@renderer/lib/format";
import { X } from "lucide-react";

/**
 * What weighs on the machine, heaviest first.
 *
 * "It's slow" cannot be fixed without knowing what is slow: each row therefore
 * carries the project responsible when the agent managed to find it, rather
 * than an anonymous "java" nobody could attribute.
 */

const BUSY_CPU = 50;

const HEAVY_MB = 2048;

export function ActivityProcesses({
  processes,
  onStop,
}: {
  processes: readonly Process[];
  onStop: (pid: number, what: string) => void;
}) {
  const t = useTranslations();

  if (processes.length === 0) {
    return <EmptyState title={t("activity.processes.empty")} />;
  }

  const peak = Math.max(...processes.map((p) => p.cpu), 1);

  return (
    <div className="divide-y divide-line">
      {processes.map((process) => (
        <div
          className="group flex items-center gap-3 px-4 py-3"
          key={process.pid}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-medium text-[12px]">
                {process.command}
              </span>
              {process.project ? (
                <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-0.5 font-data text-[10px] text-ink-2">
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

          <div className="shrink-0 text-right font-data text-[11px] tabular-nums">
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

          <IconButton
            className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            icon={X}
            label={t("activity.process.stop", {
              command: process.command,
              pid: process.pid,
            })}
            onClick={() => onStop(process.pid, process.command)}
            variant="danger"
          />
        </div>
      ))}
    </div>
  );
}
