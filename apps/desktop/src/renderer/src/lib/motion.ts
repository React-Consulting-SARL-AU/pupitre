import type { CSSProperties } from "react";

/**
 * Where a block sits in the cascade that reveals its screen.
 *
 * Past the eighth the delay stops growing: a ninth block arriving with the
 * eighth is unnoticeable, whereas a cascade that keeps counting turns the last
 * line of a long screen into a wait.
 */
const LAST = 7;

export function riseAt(index: number): CSSProperties {
  return { "--rise-index": Math.min(index, LAST) } as CSSProperties;
}

export type StepDirection = "forward" | "back";

/** The class a step of a sequence enters with, from the way it was reached. */
export function stepEnter(direction: StepDirection): string {
  return direction === "back" ? "step-back" : "step-forward";
}

/** The class it leaves with, towards the side the next one comes from. */
export function stepLeave(direction: StepDirection): string {
  return direction === "back" ? "leave-back" : "leave-forward";
}
