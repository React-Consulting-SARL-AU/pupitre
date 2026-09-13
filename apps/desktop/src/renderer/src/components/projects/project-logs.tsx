import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A project's journal, as a continuous stream.
 *
 * The lines arrive as `log` events of `project.logs` followed, so the app never
 * tails a file itself and never names one. Escape sequences are stripped — the
 * journal is captured from a terminal — and the history is bounded: a watcher
 * can write megabytes, and the page would not recover. What lands between two
 * frames is drawn in one: a build that prints a thousand lines a second is one
 * render per frame, not a thousand.
 */

const MAX_LINES = 3000;

const TAIL = 400;

// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape byte is what an ANSI sequence is made of, and stripping it is the point
const ANSI = /\u001B\[[0-9;?]*[a-zA-Z]/g;

const CARRIAGE = /\r/g;

/** One line of the journal, numbered once for the life of the stream. */
interface Line {
  id: number;
  text: string;
}

function clean(line: string): string[] {
  return line.replace(ANSI, "").replace(CARRIAGE, "").split("\n");
}

/** The lines that carry the term, case aside; an empty term keeps them all. */
export function matchingLines<L extends { text: string }>(
  lines: readonly L[],
  term: string
): readonly L[] {
  const wanted = term.trim().toLowerCase();

  return wanted
    ? lines.filter((line) => line.text.toLowerCase().includes(wanted))
    : lines;
}

export function ProjectLogs({
  serverId,
  project,
}: {
  serverId: string;
  project: string;
}) {
  const t = useTranslations();

  const [lines, setLines] = useState<Line[]>([]);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState<AgentError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [term, setTerm] = useState("");
  /** True once the bound has cut the oldest lines: what is shown is no longer the whole stream. */
  const [cut, setCut] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry itself — it is here to re-run the effect, not to be read
  useEffect(() => {
    setLines([]);
    setError(null);
    setCut(false);

    let live = true;
    let next = 0;
    let frame: number | null = null;
    let held: Line[] = [];

    function flush(): void {
      frame = null;

      const batch = held;
      held = [];

      setLines((previous) => {
        const merged = [...previous, ...batch];

        return merged.length > MAX_LINES ? merged.slice(-MAX_LINES) : merged;
      });

      if (next > MAX_LINES) {
        setCut(true);
      }
    }

    const journal = window.pupitre.followProjectJournal(
      serverId,
      project,
      TAIL,
      (line) => {
        if (!live) {
          return;
        }

        for (const text of clean(line)) {
          next += 1;
          held.push({ id: next, text });
        }

        frame ??= requestAnimationFrame(flush);
      }
    );

    journal.done.then((answer) => {
      if (live && !answer.ok) {
        setError(answer.error);
      }
    });

    return () => {
      live = false;
      journal.cancel();

      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [serverId, project, attempt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: every new line is a reason to follow — the count is the signal, not a value read
  useEffect(() => {
    if (follow) {
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [follow, lines.length]);

  const shown = useMemo(() => matchingLines(lines, term), [lines, term]);
  const searching = term.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-line border-b px-4 py-2">
        <span className="font-data text-[12px] text-ink-3">
          {t("project.logs.journal", { name: project })}
        </span>

        <span className="flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-0.5">
          <Search className="shrink-0 text-ink-4" size={12} strokeWidth={1.5} />
          <input
            aria-label={t("project.logs.search")}
            autoComplete="off"
            className="w-44 bg-transparent font-data text-[12px] text-ink outline-none placeholder:text-ink-4"
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("project.logs.search")}
            spellCheck={false}
            type="search"
            value={term}
          />
          {searching ? (
            <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
              {t.plural("project.logs.matches", shown.length)}
            </span>
          ) : null}
        </span>

        <CopyButton
          disabled={lines.length === 0}
          hint={t("project.logs.copyAllHint")}
          onCopy={() =>
            navigator.clipboard.writeText(
              lines.map((line) => line.text).join("\n")
            )
          }
        >
          {t("project.logs.copyAll")}
        </CopyButton>

        <label className="clickable ml-auto flex items-center gap-2 font-data text-[11px] text-ink-3">
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
        {cut ? (
          <p
            className="mb-2 border-line border-b pb-2 text-[11px] text-ink-3"
            data-logs-cut="true"
          >
            {t("project.logs.cut", { count: MAX_LINES })}
          </p>
        ) : null}

        {lines.length === 0 && !error ? (
          <WaitingLine>
            {t("project.logs.waiting", { name: project })}
          </WaitingLine>
        ) : null}

        {lines.length > 0 && shown.length === 0 ? (
          <p className="text-ink-3">{t("project.logs.noMatch")}</p>
        ) : null}

        {shown.map((line) => (
          <div className="whitespace-pre-wrap break-all" key={line.id}>
            {line.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
