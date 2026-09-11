import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { useEffect, useRef, useState } from "react";

/**
 * The unit's journal, followed line by line.
 *
 * The lines are `log` events of `service.logs` followed: the app never names a
 * unit, never tails a file. The history is bounded — a service that loops on
 * an error writes megabytes — and what lands between two frames is drawn in
 * one. Scrolling up lets go of the tail; the box below hooks it back.
 */

const MAX_LINES = 2000;

const TAIL = 120;

// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape byte is what an ANSI sequence is made of, and stripping it is the point
const ANSI = /\[[0-9;?]*[a-zA-Z]/g;

const CARRIAGE = /\r/g;

interface Line {
  id: number;
  text: string;
}

function clean(line: string): string[] {
  return line.replace(ANSI, "").replace(CARRIAGE, "").split("\n");
}

export function ServiceJournal({
  serverId,
  moduleId,
  name,
}: {
  serverId: string;
  moduleId: string;
  /** The service's own name, for the reader; the unit stays the agent's. */
  name: string;
}) {
  const t = useTranslations();

  const [lines, setLines] = useState<Line[]>([]);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState<AgentError | null>(null);
  const [attempt, setAttempt] = useState(0);
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

    const journal = window.pupitre.followServiceJournal(
      serverId,
      moduleId,
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
  }, [serverId, moduleId, attempt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: every new line is a reason to follow — the count is the signal, not a value read
  useEffect(() => {
    if (follow) {
      end.current?.scrollIntoView({ block: "end" });
    }
  }, [follow, lines.length]);

  return (
    <section className="flex flex-col gap-3" data-service-journal={moduleId}>
      <div className="flex flex-wrap items-center gap-3">
        <Label>{t("services.journal.title")}</Label>

        <CopyButton
          disabled={lines.length === 0}
          onCopy={() =>
            navigator.clipboard.writeText(
              lines.map((line) => line.text).join("\n")
            )
          }
          title={t("services.journal.copyAllHint", { name })}
        >
          {t("services.journal.copyAll")}
        </CopyButton>

        <label className="clickable ml-auto flex items-center gap-2 font-data text-[11px] text-ink-3">
          <input
            checked={follow}
            className="accent-ink"
            onChange={(event) => setFollow(event.target.checked)}
            type="checkbox"
          />
          {t("services.journal.follow")}
        </label>
      </div>

      {error ? (
        <ErrorNotice
          error={error}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      ) : null}

      <div
        className="max-h-80 overflow-auto rounded-md border border-line bg-sunken px-4 py-3 font-data text-[12px] text-ink-2 leading-[1.7]"
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
            {t("services.journal.cut", { count: MAX_LINES })}
          </p>
        ) : null}

        {lines.length === 0 && !error ? (
          <WaitingLine>{t("services.journal.waiting", { name })}</WaitingLine>
        ) : null}

        {lines.map((line) => (
          <div className="whitespace-pre-wrap break-all" key={line.id}>
            {line.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}
