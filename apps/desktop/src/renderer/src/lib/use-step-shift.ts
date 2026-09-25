import { useEffect, useRef, useState } from "react";
import type { StepDirection } from "./motion";
import { stepEnter, stepLeave } from "./motion";

const EXIT_MS = 160;

export interface StepShift<T> {
  /** May still be the step that is leaving. */
  shown: T;
  motion: string;
}

export function useStepShift<T>(
  step: T,
  rankOf: (value: T) => number
): StepShift<T> {
  const [shown, setShown] = useState(step);
  const [leaving, setLeaving] = useState(false);

  const here = rankOf(step);
  const there = rankOf(shown);
  const direction: StepDirection = here < there ? "back" : "forward";
  const entered = useRef<StepDirection>("forward");

  useEffect(() => {
    if (step === shown) {
      return;
    }

    // Outside the sequence (wizard closed) no animation, or reopening would flash the step left behind.
    if (here < 0 || there < 0) {
      entered.current = "forward";
      setShown(step);
      setLeaving(false);

      return;
    }

    setLeaving(true);

    const timer = setTimeout(() => {
      entered.current = direction;
      setShown(step);
      setLeaving(false);
    }, EXIT_MS);

    return () => clearTimeout(timer);
  }, [step, shown, here, there, direction]);

  return {
    motion: leaving ? stepLeave(direction) : stepEnter(entered.current),
    shown,
  };
}
