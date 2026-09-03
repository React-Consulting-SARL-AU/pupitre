import { useEffect, useRef, useState } from "react";
import { cleanProfile, logPath } from "@shared/profile";
import { useAppState } from "../stores/state";

const MAX_LINES = 3000;
const ANSI_SEQUENCES = /\[[0-9;?]*[a-zA-Z]/g;
const CARRIAGE_RETURNS = /\r/g;

/**
 * A project's log, as a continuous stream.
 *
 * Escape sequences are stripped: the log is captured from a terminal, so it is
 * full of colour and repositioning codes nobody wants to read. And we bound the
 * history — a Vite watcher can write megabytes, and the browser would not
 * recover.
 */
export function LogPanel({ project }: { project: string | null }) {
  const servers = useAppState((s) => s.servers);
  const [lines, setLines] = useState<string[]>([]);
  const [follow, setFollow] = useState(true);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLines([]);
    if (!project) {
      return;
    }

    const detach = window.pupitre.onLogLine((line) => {
      if (line.project !== project) {
        return;
      }
      const clean = line.text
        .replace(ANSI_SEQUENCES, "")
        .replace(CARRIAGE_RETURNS, "");
      setLines((previous) => {
        const next = [...previous, ...clean.split("\n")];
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    });

    window.pupitre.followLog(project);
    return () => {
      window.pupitre.stopLog(project);
      detach();
    };
  }, [project]);

  useEffect(() => {
    if (follow) {
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [follow]);

  if (!project) {
    return (
      <div className="grid h-full place-items-center text-ink-4">
        Select a project
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-line border-b px-4 py-2">
        <span className="font-mono text-[11px] text-ink-3">
          {logPath(
            cleanProfile(
              servers?.servers.find((s) => s.id === servers.active)?.profile
            ),
            project
          )}
        </span>
        <label className="clickable flex items-center gap-2 font-mono text-[10px] text-ink-4">
          <input
            checked={follow}
            className="accent-accent"
            onChange={(e) => setFollow(e.target.checked)}
            type="checkbox"
          />
          follow the tail
        </label>
      </div>

      <div
        className="flex-1 overflow-auto px-4 py-3 font-mono text-[11px] leading-[1.7] text-ink-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (!atBottom && follow) {
            setFollow(false);
          }
        }}
      >
        {lines.length === 0 ? (
          <span className="text-ink-4">Waiting for output…</span>
        ) : (
          lines.map((line, i) => (
            <div
              className={
                line.startsWith("=== dev ")
                  ? "my-1 border-accent border-l-2 pl-2 text-accent-strong"
                  : "whitespace-pre-wrap break-all"
              }
              // biome-ignore lint/suspicious/noArrayIndexKey: a log is a stream, its position IS its identity
              key={i}
            >
              {line}
            </div>
          ))
        )}
        <div ref={end} />
      </div>
    </div>
  );
}
