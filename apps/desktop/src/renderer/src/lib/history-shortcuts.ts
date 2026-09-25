import type { KeyChord } from "./terminal-shortcuts";

export type HistoryStep = "back" | "forward";

const BACK_BUTTON = 3;
const FORWARD_BUTTON = 4;

export function historyChord(step: HistoryStep, mac: boolean): string {
  if (mac) {
    return step === "back" ? "⌘[" : "⌘]";
  }

  return step === "back" ? "Alt+←" : "Alt+→";
}

export function historyStepOf(
  event: KeyChord,
  mac: boolean
): HistoryStep | null {
  if (event.type !== "keydown" || event.shiftKey) {
    return null;
  }

  if (mac) {
    if (!event.metaKey || event.ctrlKey || event.altKey) {
      return null;
    }

    return stepFrom(event.key, "[", "]");
  }

  if (!event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  return stepFrom(event.key, "ArrowLeft", "ArrowRight");
}

export function historyStepOfButton(button: number): HistoryStep | null {
  if (button === BACK_BUTTON) {
    return "back";
  }

  return button === FORWARD_BUTTON ? "forward" : null;
}

function stepFrom(key: string, back: string, forward: string) {
  if (key === back) {
    return "back";
  }

  return key === forward ? "forward" : null;
}

export interface Closest {
  closest: (selector: string) => unknown;
}

/** In a terminal or on a tab row the same chords switch tabs, so history must not walk too. */
export function claimedByTerminal(target: unknown): boolean {
  const element = target as Closest | null;

  return (
    typeof element?.closest === "function" &&
    element.closest('.xterm, [role="tablist"]') !== null
  );
}
