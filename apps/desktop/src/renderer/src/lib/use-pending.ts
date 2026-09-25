import { translate } from "@renderer/i18n/translate";
import { useGestureFailure } from "@renderer/stores/gesture-failure";
import { useCallback, useState } from "react";

/** Untyped return on purpose: a handler doing work returns its promise, one that only moves the screen returns nothing. */
export type Gesture<A extends unknown[] = []> = (...args: A) => unknown;

/** Only a promise is worth a spinner; anything else was done before the click returned. */
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

export function reportFailure(reason: unknown): void {
  const said = reason instanceof Error ? reason.message : String(reason);

  useGestureFailure
    .getState()
    .fail(translate()("ui.gesture.failed", { reason: said }));
}

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
