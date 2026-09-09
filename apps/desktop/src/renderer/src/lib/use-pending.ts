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
 * Keeps the control that was clicked waiting until the work it started settles.
 *
 * A handler that answers with a promise is work worth showing; anything else
 * had already happened by the time the click returned, and a spinner that turns
 * for one frame says less than nothing.
 */
export function usePending<A extends unknown[]>(
  gesture: Gesture<A> | undefined
): [(...args: A) => void, boolean] {
  const [pending, setPending] = useState(false);

  const start = useCallback(
    (...args: A) => {
      const work = gesture?.(...args);

      if (!(work instanceof Promise)) {
        return;
      }

      setPending(true);

      const settle = () => setPending(false);

      work.then(settle, settle);
    },
    [gesture]
  );

  return [start, pending];
}
