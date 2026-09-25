import { useEffect, useState } from "react";
import { humanMs } from "../../lib/duration";

const TICK_MS = 100;

// Counts from mount: the agent only reports a step's duration once it is over.
export function LiveDuration({ className }: { className?: string }) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const since = Date.now();
    const timer = setInterval(() => setMs(Date.now() - since), TICK_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <span className={className} data-live="duration">
      {humanMs(ms)}
    </span>
  );
}
