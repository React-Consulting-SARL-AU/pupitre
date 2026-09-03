import type { Session } from "@shared/contract";
import { Braces, Sparkles, Trash2, X } from "lucide-react";

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

function memory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/**
 * What outlives whatever started it.
 *
 * An agent or a remote IDE backend keeps living when its terminal disappears —
 * app closed, IntelliJ window shut — and holds its memory for nobody. A JetBrains
 * backend alone weighs several gigabytes.
 */
export function Sessions({
  list,
  onStop,
  onClean,
}: {
  list: Session[];
  onStop: (pid: number) => void;
  onClean: () => void;
}) {
  const total = list.reduce((sum, s) => sum + s.ram_mb, 0);

  if (list.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-ink-4">
        No background session
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-line border-b px-4 py-2">
        <span className="font-mono text-[11px] text-ink-4">
          {list.length} session{list.length > 1 ? "s" : ""} ·{" "}
          <span className={total > 2048 ? "text-warn" : ""}>
            {memory(total)}
          </span>
        </span>
        <button
          className="transition-soft flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] text-ink-3 hover:border-danger hover:text-danger"
          onClick={onClean}
          type="button"
        >
          <Trash2 size={12} />
          Stop idle ones
        </button>
      </div>

      <div className="divide-y divide-line">
        {list
          .slice()
          .sort((a, b) => b.ram_mb - a.ram_mb)
          .map((session) => (
            <div className="flex items-center gap-3 px-4 py-2" key={session.pid}>
              {session.kind === "ide" ? (
                <Braces className="shrink-0 text-ink-4" size={14} />
              ) : (
                <Sparkles className="shrink-0 text-ink-4" size={14} />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px]">{session.command}</p>
                <p className="font-mono text-[10px] text-ink-4">
                  {session.kind === "ide" ? "remote IDE" : "agent"} · pid{" "}
                  {session.pid} · {duration(session.seconds)}
                </p>
              </div>

              <span
                className={`shrink-0 font-mono text-[11px] tabular-nums ${
                  session.ram_mb > 1024 ? "text-warn" : "text-ink-4"
                }`}
              >
                {memory(session.ram_mb)}
              </span>

              <button
                aria-label={`Stop session ${session.pid}`}
                className="transition-soft shrink-0 rounded-md border border-line p-1 text-ink-4 hover:border-danger hover:text-danger"
                onClick={() => onStop(session.pid)}
                type="button"
              >
                <X size={13} />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
