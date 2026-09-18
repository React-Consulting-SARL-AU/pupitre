import type { AgentError, AgentResponse } from "@shared/agent";
import { useEffect, useRef, useState } from "react";
import { JournalBuffer, type JournalRow } from "./journal-buffer";

/** A follow the preload opened: its outcome, and the way to leave it. */
export interface Follow {
  done: Promise<AgentResponse<unknown>>;
  cancel: () => void;
}

export interface Journal {
  rows: readonly JournalRow[];
  /** True once the bound has cut the oldest rows: what is shown is no longer the whole stream. */
  cut: boolean;
  error: AgentError | null;
  retry: () => void;
}

/**
 * A journal followed line by line, for as long as the reader stays.
 *
 * The lines land in a terminal-shaped buffer, and what lands between two
 * frames is drawn in one: a build that prints a thousand lines a second is one
 * render per frame, not a thousand. `key` names what is followed; a new key
 * empties the buffer and opens the follow again, as does a retry.
 */
export function useJournal(
  open: (onLine: (line: string) => void) => Follow,
  key: string,
  limit: number
): Journal {
  const opener = useRef(open);
  opener.current = open;

  const [rows, setRows] = useState<readonly JournalRow[]>([]);
  const [cut, setCut] = useState(false);
  const [error, setError] = useState<AgentError | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry itself — it is here to re-run the effect, not to be read
  useEffect(() => {
    setRows([]);
    setCut(false);
    setError(null);

    const buffer = new JournalBuffer(limit);
    let live = true;
    let frame: number | null = null;

    function flush(): void {
      frame = null;
      setRows(buffer.snapshot());

      if (buffer.dropped > 0) {
        setCut(true);
      }
    }

    const follow = opener.current((line) => {
      if (!live) {
        return;
      }

      buffer.write(line);
      frame ??= requestAnimationFrame(flush);
    });

    follow.done.then((answer) => {
      if (live && !answer.ok) {
        setError(answer.error);
      }
    });

    return () => {
      live = false;
      follow.cancel();

      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [key, limit, attempt]);

  return {
    rows,
    cut,
    error,
    retry: () => setAttempt((count) => count + 1),
  };
}
