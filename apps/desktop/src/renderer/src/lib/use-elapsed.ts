import { useEffect, useState } from "react";

const TICK_MS = 200;

/**
 * How long a wait has lasted, in milliseconds.
 *
 * A silent wait is the one thing a screen cannot explain: the counter does not
 * shorten it, but it says it is moving, which no looping animation really says.
 * It restarts at zero when the wait starts again, and stays at zero when there
 * is none.
 */
export function useElapsed(active: boolean): number {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    setMs(0);

    if (!active) {
      return;
    }

    const started = Date.now();
    const timer = setInterval(() => setMs(Date.now() - started), TICK_MS);

    return () => clearInterval(timer);
  }, [active]);

  return active ? ms : 0;
}
