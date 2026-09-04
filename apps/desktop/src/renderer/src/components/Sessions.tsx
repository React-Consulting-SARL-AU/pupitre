import type { Session } from "@shared/contract";
import { Braces, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { IconButton } from "./ui/icon-button";

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
    return <EmptyState title="No background session" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between border-line border-b px-4 py-2">
        <span className="font-data text-[11px] text-ink-3">
          {list.length} session{list.length > 1 ? "s" : ""} ·{" "}
          <span className={total > 2048 ? "text-warn" : ""}>
            {memory(total)}
          </span>
        </span>
        <Button icon={Trash2} onClick={onClean} size="sm" variant="danger">
          Stop idle ones
        </Button>
      </div>

      <div className="divide-y divide-line">
        {list
          .slice()
          .sort((a, b) => b.ram_mb - a.ram_mb)
          .map((session) => (
            <div
              className="flex items-center gap-3 px-4 py-2"
              key={session.pid}
            >
              {session.kind === "ide" ? (
                <Braces
                  className="shrink-0 text-ink-3"
                  size={14}
                  strokeWidth={1.5}
                />
              ) : (
                <Sparkles
                  className="shrink-0 text-ink-3"
                  size={14}
                  strokeWidth={1.5}
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px]">{session.command}</p>
                <p className="font-data text-[10px] text-ink-3">
                  {session.kind === "ide" ? "remote IDE" : "agent"} · pid{" "}
                  {session.pid} · {duration(session.seconds)}
                </p>
              </div>

              <span
                className={`shrink-0 font-data text-[11px] tabular-nums ${
                  session.ram_mb > 1024 ? "text-warn" : "text-ink-3"
                }`}
              >
                {memory(session.ram_mb)}
              </span>

              <IconButton
                icon={X}
                label={`Stop session ${session.pid}`}
                onClick={() => onStop(session.pid)}
                variant="danger"
              />
            </div>
          ))}
      </div>
    </div>
  );
}
