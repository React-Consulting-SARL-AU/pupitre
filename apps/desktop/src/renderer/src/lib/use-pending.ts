import { translate } from "@renderer/i18n/translate";
import { useGestureFailure } from "@renderer/stores/gesture-failure";
import { useCallback, useState } from "react";

/**
 * A gesture that hands back whatever it started.
 *
 * The return is untyped on purpose: a handler that does work answers with its
 * promise, one that only moves the screen answers with nothing, and both are
 * written the same way at the call site.
 */
export type Gesture<A extends unknown[] = []> = (...args: A) => unknown;

/**
 * Follows the work a gesture started, when it started any.
 *
 * A handler that answers with a promise is work worth showing; anything else
 * had already happened by the time the click returned, and a spinner that turns
 * for one frame says less than nothing. The wait ends however the work ends,
 * and what it failed on is handed back rather than dropped on the floor.
 */
export function awaited(
  work: unknown,
  onPending: (pending: boolean) => void
): Promise<void> | null {
  if (!(work instanceof Promise)) {
    return null;
  }

  onPending(true);

  return work.then(
    () => onPending(false),
    (reason: unknown) => {
      onPending(false);

      throw reason;
    }
  );
}

/** A gesture that threw is shown at the foot of the window: the button stopped, and this is why. */
export function reportFailure(reason: unknown): void {
  const said = reason instanceof Error ? reason.message : String(reason);

  useGestureFailure
    .getState()
    .fail(translate()("ui.gesture.failed", { reason: said }));
}

/** Keeps the control that was clicked waiting until the work it started settles. */
export function usePending<A extends unknown[]>(
  gesture: Gesture<A> | undefined
): [(...args: A) => void, boolean] {
  const [pending, setPending] = useState(false);

  const start = useCallback(
    (...args: A) => {
      awaited(gesture?.(...args), setPending)?.catch(reportFailure);
    },
    [gesture]
  );

  return [start, pending];
}
