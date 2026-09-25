import type { WaitingPhase } from "@renderer/components/ui/waiting-notice";

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
