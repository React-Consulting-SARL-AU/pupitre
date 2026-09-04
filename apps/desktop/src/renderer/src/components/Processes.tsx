import type { ProcessInfo } from "@shared/contract";
import { X } from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { IconButton } from "./ui/icon-button";

/**
 * What weighs on the machine, heaviest first.
 *
 * "It's slow" cannot be fixed without knowing what is slow: each row therefore
 * carries the project responsible when the server managed to find it, rather
 * than an anonymous "java" nobody could attribute.
 */
export function Processes({
  list,
  onStop,
}: {
  list: ProcessInfo[];
  onStop: (pid: number, what: string) => void;
}) {
  if (list.length === 0) {
    return <EmptyState title="No notable process" />;
  }

  const maxCpu = Math.max(...list.map((p) => p.cpu), 1);

  return (
    <div className="divide-y divide-line">
      {list.map((p) => (
        <div className="group flex items-center gap-3 px-4 py-2" key={p.pid}>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-medium text-[12px]">
                {p.command}
              </span>
              {p.project ? (
                <span className="shrink-0 rounded-sm border border-line-strong px-1.5 py-0.5 font-data text-[10px] text-ink-2">
                  {p.project}
                </span>
              ) : null}
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-ink-3 transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(2, (p.cpu / maxCpu) * 100)}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 text-right font-data text-[11px] tabular-nums">
            <div className={p.cpu > 50 ? "text-warn" : "text-ink-2"}>
              {p.cpu.toFixed(0)} %
            </div>
            <div className={p.ram_mb > 2048 ? "text-warn" : "text-ink-3"}>
              {p.ram_mb >= 1024
                ? `${(p.ram_mb / 1024).toFixed(1)} GB`
                : `${p.ram_mb} MB`}
            </div>
          </div>

          <IconButton
            className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
            icon={X}
            label={`Stop ${p.command} (pid ${p.pid})`}
            onClick={() => onStop(p.pid, p.command)}
            variant="danger"
          />
        </div>
      ))}
    </div>
  );
}
