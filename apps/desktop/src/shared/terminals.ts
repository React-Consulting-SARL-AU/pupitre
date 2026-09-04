/**
 * What a terminal of the app is, on both sides of the bridge.
 *
 * The agent knows sessions, not tabs: a terminal is a window this app opened on
 * a shell, and its identity, its title and its state live here alone.
 */

/** The command-line agents a terminal can carry. */
export type TerminalAgent = "claude" | "codex";

export type TerminalKind = "shell" | TerminalAgent;

/**
 * What a session is doing, inferred from its stream.
 *
 * None of this is read from the displayed text: the interfaces of Claude and
 * Codex change, and a signal based on their layout would be wrong at the first
 * redesign. So we watch the pipe — the PTY throughput, the terminal bell, the
 * death of the process.
 */
export type AgentState =
  | "working"
  | "attention"
  | "idle"
  | "asleep"
  | "finished";

export type Terminal = {
  id: string;
  kind: TerminalKind;
  title: string;
  project: string | null;
  dir: string | null;
};
