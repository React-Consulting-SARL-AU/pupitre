import type { WaitingPhase } from "@renderer/components/ui/waiting-notice";

/**
 * A sequence of steps, placed by the one that is running.
 *
 * What comes before is done, what comes after is pending: the screen has
 * nothing to work out, it names the current step and the shape of each dot
 * follows. A current step absent from the sequence leaves everything pending
 * rather than pretend nothing is left.
 */
export function phasesAt<T extends string>(
  order: readonly T[],
  current: T,
  label: (id: T) => string
): WaitingPhase[] {
  const here = order.indexOf(current);

  return order.map((id, index) => {
    let state: WaitingPhase["state"] = "ahead";

    if (here >= 0 && index < here) {
      state = "done";
    } else if (index === here) {
      state = "running";
    }

    return { id, label: label(id), state };
  });
}
