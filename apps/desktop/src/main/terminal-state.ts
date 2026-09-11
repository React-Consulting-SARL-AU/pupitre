import type { AgentState, TerminalKind } from "@shared/terminals";

/**
 * What a session is doing, read from the pipe rather than from the screen.
 *
 * None of this looks at the displayed text: the interfaces of Claude and Codex
 * change, and a signal based on their layout would be wrong at the first
 * redesign. So we watch the pipe — the throughput, the terminal bell, the death
 * of the process.
 */

const STREAM_MS = 1200;
const ASLEEP_MS = 5 * 60 * 1000;
/** Below this, it is a keystroke echo or a redraw, not work. */
const MINIMUM_WORK = 200;

/** What the state is read from, without the process that produces it. */
export interface Activity {
  kind: TerminalKind;
  /** Last byte that counted as work. */
  seenAt: number;
  /** Last byte of any kind, so a burst can be told from a lone redraw. */
  lastByteAt: number;
  /** Bytes of the burst under way. */
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

/**
 * Bytes arriving on the pipe, and whether they say anything.
 *
 * Every session runs under tmux, which redraws its status line on its own every
 * few seconds. Counted as work, that lone redraw would make a session look busy
 * for a moment and keep it from ever falling asleep. So a burst only counts once
 * it carries more than a redraw, and a burst ends as soon as the pipe goes
 * quiet: output that keeps coming, however thin, still adds up to work.
 */
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

/** A keystroke: the reader is there, and what the agent produced has been read. */
export function noteKeystroke(activity: Activity, now: number): void {
  activity.bell = false;
  activity.sinceKeystroke = 0;
  activity.burst = 0;
  activity.seenAt = now;
  activity.lastByteAt = now;
}

/**
 * The bell is the clean signal — agents ring it when they hand back control. It
 * is not guaranteed, though: an agent may not ring it, or the setting may be
 * off. Hence the fallback on the stream: an agent that produced something and
 * then went quiet is waiting for you, bell or no bell.
 *
 * This reasoning only holds for an agent. A shell also goes quiet after writing,
 * and that means nothing more than "the command is done".
 */
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
