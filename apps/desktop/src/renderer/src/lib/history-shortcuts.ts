import type { KeyChord } from "./terminal-shortcuts";

export type HistoryStep = "back" | "forward";

const BACK_BUTTON = 3;
const FORWARD_BUTTON = 4;

/** The shortcut a tooltip prints, on this platform. */
export function historyChord(step: HistoryStep, mac: boolean): string {
  if (mac) {
    return step === "back" ? "⌘[" : "⌘]";
  }

  return step === "back" ? "Alt+←" : "Alt+→";
}

/**
 * The keys a browser walks its history with, and nothing else.
 *
 * On macOS they live on the command key with the brackets; elsewhere on the
 * alt key with the arrows. Both are what the reader's hands already know from
 * every browser, and neither is one a text field or a terminal claims.
 */
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

/** The two side buttons of a mouse, as every browser reads them. */
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

/** What `closest` needs of an event target, so a test can hand in a stub. */
export interface Closest {
  closest: (selector: string) => unknown;
}

/**
 * Whether the keys belong to a terminal right now.
 *
 * Inside a terminal the same chords move between its tabs, and on its tab
 * row they are the row's to answer: the history must not walk at the same
 * time, or one press would do two things.
 */
export function claimedByTerminal(target: unknown): boolean {
  const element = target as Closest | null;

  return (
    typeof element?.closest === "function" &&
    element.closest('.xterm, [role="tablist"]') !== null
  );
}
