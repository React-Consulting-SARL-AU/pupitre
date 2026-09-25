import type { AgentError, AgentResponse } from "@shared/agent";
import { useEffect, useRef, useState } from "react";
import { JournalBuffer, type JournalRow } from "./journal-buffer";

export interface Follow {
  done: Promise<AgentResponse<unknown>>;
  cancel: () => void;
}

export interface Journal {
  rows: readonly JournalRow[];
  /** The bound has dropped the oldest rows. */
  cut: boolean;
  error: AgentError | null;
  retry: () => void;
}

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
