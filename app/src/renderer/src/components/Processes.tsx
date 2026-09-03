import type { ProcessInfo } from "@shared/contract";
import { X } from "lucide-react";

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
    return (
      <p className="px-4 py-6 text-center text-ink-4">No notable process</p>
    );
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
                <span className="shrink-0 rounded bg-accent-veil px-1.5 py-0.5 font-mono text-[10px] text-accent-strong">
                  {p.project}
                </span>
              ) : null}
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(2, (p.cpu / maxCpu) * 100)}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 text-right font-mono text-[11px] tabular-nums">
            <div className={p.cpu > 50 ? "text-warn" : "text-ink-2"}>
              {p.cpu.toFixed(0)} %
            </div>
            <div className={p.ram_mb > 2048 ? "text-warn" : "text-ink-4"}>
              {p.ram_mb >= 1024
                ? `${(p.ram_mb / 1024).toFixed(1)} GB`
                : `${p.ram_mb} MB`}
            </div>
          </div>

          <button
            aria-label={`Stop ${p.command}`}
            className="transition-soft shrink-0 rounded-md border border-line p-1 text-ink-4 opacity-0 hover:border-danger hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => onStop(p.pid, p.command)}
            title={`Stop ${p.command} (pid ${p.pid})`}
            type="button"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
