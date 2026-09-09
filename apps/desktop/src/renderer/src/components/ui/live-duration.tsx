import { useEffect, useState } from "react";
import { humanMs } from "../../lib/duration";

/**
 * How long the app has been waiting on something still at work.
 *
 * The agent says how long a step took once it is over; until then the only
 * honest number is the app's own wait, counted from the moment this appeared.
 * It is replaced by the agent's figure the moment there is one, so a screen
 * in progress moves without ever claiming a duration it does not have.
 */

const TICK_MS = 100;

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
