import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { useEffect, useRef, useState } from "react";

/**
 * A project's journal, as a continuous stream.
 *
 * The lines arrive as `log` events of `project.logs` followed, so the app never
 * tails a file itself and never names one. Escape sequences are stripped — the
 * journal is captured from a terminal — and the history is bounded: a watcher
 * can write megabytes, and the page would not recover.
 */

const MAX_LINES = 3000;

const TAIL = 400;

// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape byte is what an ANSI sequence is made of, and stripping it is the point
const ANSI = /\u001B\[[0-9;?]*[a-zA-Z]/g;

const CARRIAGE = /\r/g;

function clean(line: string): string[] {
  return line.replace(ANSI, "").replace(CARRIAGE, "").split("\n");
}

export function ProjectLogs({
  serverId,
  project,
}: {
  serverId: string;
  project: string;
}) {
  const t = useTranslations();

  const [lines, setLines] = useState<string[]>([]);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState<AgentError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const end = useRef<HTMLDivElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry itself — it is here to re-run the effect, not to be read
  useEffect(() => {
    setLines([]);
    setError(null);

    let live = true;

    window.pupitre
      .projectJournal(serverId, project, TAIL, true, (line) => {
        if (!live) {
          return;
        }

        setLines((previous) => {
          const next = [...previous, ...clean(line)];

          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      })
      .then((answer) => {
        if (live && !answer.ok) {
          setError(answer.error);
        }
      });

    return () => {
      live = false;
    };
  }, [serverId, project, attempt]);

  useEffect(() => {
    if (follow) {
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [follow]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-line border-b px-4 py-2">
        <span className="font-data text-[12px] text-ink-3">
          {t("project.logs.journal", { name: project })}
        </span>
        <label className="clickable flex items-center gap-2 font-data text-[11px] text-ink-3">
          <input
            checked={follow}
            className="accent-ink"
            onChange={(event) => setFollow(event.target.checked)}
            type="checkbox"
          />
          {t("project.logs.follow")}
        </label>
      </div>

      {error ? (
        <div className="p-4">
          <ErrorNotice
            error={error}
            onRetry={() => setAttempt((count) => count + 1)}
          />
        </div>
      ) : null}

      <div
        className="flex-1 overflow-auto bg-sunken px-4 py-3 font-data text-[12px] text-ink-2 leading-[1.7]"
        onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            40;

          if (!atBottom && follow) {
            setFollow(false);
          }
        }}
      >
        {lines.length === 0 && !error ? (
          <WaitingLine>
            {t("project.logs.waiting", { name: project })}
          </WaitingLine>
        ) : (
          lines.map((line, index) => (
            <div
              className="whitespace-pre-wrap break-all"
              // biome-ignore lint/suspicious/noArrayIndexKey: a journal is a stream, its position IS its identity
              key={index}
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
