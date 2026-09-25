import { useEffect, useState } from "react";

const TICK_MS = 200;

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
