import { useEffect, useRef, useState } from "react";
import type { StepDirection } from "./motion";
import { stepEnter, stepLeave } from "./motion";

/**
 * A sequence of screens that follow on rather than replace each other.
 *
 * The screen on display is not immediately the one just asked for: it leaves
 * first, towards the side you are heading, then the next arrives from the other
 * side. That offset is short — the exit is briefer than the entrance, nobody
 * waits on a goodbye — and it is what makes a sequence read as a sequence.
 *
 * The rail does not wait for it: it moves as soon as the change is asked, so
 * the panel's motion confirms a change already announced.
 *
 * A value outside the sequence — `-1`, the wizard closed — does not animate:
 * you enter and leave it at once, otherwise reopening the wizard would show the
 * screen you had left for a fraction of a second.
 */

const EXIT_MS = 160;

export interface StepShift<T> {
  /** The step to render now, which may be the one that's leaving. */
  shown: T;
  /** The animation class to put on the step's block. */
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

    // Outside the sequence, there's nothing to leave and nothing to announce.
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
