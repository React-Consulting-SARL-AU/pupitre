import type { CSSProperties } from "react";

// Capped so the last blocks of a long screen never wait on the cascade.
const LAST = 7;

export function riseAt(index: number): CSSProperties {
  return { "--rise-index": Math.min(index, LAST) } as CSSProperties;
}

export type StepDirection = "forward" | "back";

export function stepEnter(direction: StepDirection): string {
  return direction === "back" ? "step-back" : "step-forward";
}

export function stepLeave(direction: StepDirection): string {
  return direction === "back" ? "leave-back" : "leave-forward";
}
