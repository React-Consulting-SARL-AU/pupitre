import type { AgentState, TerminalKind } from "@shared/terminals";

const STREAM_MS = 1200;
const ASLEEP_MS = 5 * 60 * 1000;
/** Below this, it is a keystroke echo or a redraw, not work. */
const MINIMUM_WORK = 200;

/** Read from the pipe, never the screen: the layouts of Claude and Codex change at every redesign. */
export interface Activity {
  kind: TerminalKind;
  /** Last byte that counted as work. */
  seenAt: number;
  /** Last byte of any kind, so a burst can be told from a lone redraw. */
  lastByteAt: number;
  burst: number;
  /** Bytes received since the last keystroke: what the agent produced for you. */
  sinceKeystroke: number;
  /** A bell arrived and you have not answered yet. */
  bell: boolean;
  finished: boolean;
}

export function freshActivity(kind: TerminalKind, now: number): Activity {
  return {
    bell: false,
    burst: 0,
    finished: false,
    kind,
    lastByteAt: now,
    seenAt: now,
    sinceKeystroke: 0,
  };
}

/** tmux redraws its status line on its own: counted as work, it would keep a session from ever sleeping. */
export function noteOutput(
  activity: Activity,
  bytes: number,
  now: number
): void {
  const quiet = now - activity.lastByteAt > STREAM_MS;
  const counted = activity.burst >= MINIMUM_WORK && !quiet;

  activity.burst = quiet ? bytes : activity.burst + bytes;
  activity.lastByteAt = now;

  if (activity.burst < MINIMUM_WORK) {
    return;
  }

  activity.seenAt = now;
  activity.sinceKeystroke += counted ? bytes : activity.burst;
}

export function noteKeystroke(activity: Activity, now: number): void {
  activity.bell = false;
  activity.sinceKeystroke = 0;
  activity.burst = 0;
  activity.seenAt = now;
  activity.lastByteAt = now;
}

/** The bell is not guaranteed, so an agent that produced output then went quiet is waiting too; not a shell. */
export function stateOf(activity: Activity, now: number): AgentState {
  if (activity.finished) {
    return "finished";
  }

  const silence = now - activity.seenAt;

  if (silence < STREAM_MS) {
    return "working";
  }

  const isAgent = activity.kind !== "shell";

  if (isAgent && (activity.bell || activity.sinceKeystroke > MINIMUM_WORK)) {
    return "attention";
  }

  return silence > ASLEEP_MS ? "asleep" : "idle";
}
