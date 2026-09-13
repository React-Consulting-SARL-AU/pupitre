/**
 * What a terminal of the app is, on both sides of the bridge.
 *
 * The agent knows sessions, not tabs: a terminal is a window this app opened on
 * a shell, and its identity, its title and its state live here alone.
 */

/** The command-line agents a terminal can carry. */
export type TerminalAgent =
  | "claude"
  | "codex"
  | "cursor"
  | "opencode"
  | "hermes";

export type TerminalKind = "shell" | TerminalAgent;

export const TERMINAL_KINDS: readonly TerminalKind[] = [
  "shell",
  "claude",
  "codex",
  "cursor",
  "opencode",
  "hermes",
];

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

export interface Terminal {
  id: string;
  kind: TerminalKind;
  title: string;
  project: string | null;
  /** A folder under the project's, or under the server's root, the shell opened in. */
  dir: string | null;
  /** The tmux session the tab attaches to, named by the main process. */
  session: string | null;
  /**
   * A tab the last run left behind.
   *
   * It is drawn, it can be renamed and closed, but nothing is attached until
   * the reader comes back to it: a relaunch must not open ten sessions on the
   * machine for tabs nobody has asked for yet.
   */
  dormant: boolean;
}

/** What a tab that closes for good takes with it: the session it held. */
export interface TerminalEnd {
  serverId: string;
  session: string;
}

/** What the main process answers once a session is up. */
export interface TerminalOpened {
  /** The session the agent named, when the terminal carries an agent. */
  session: string | null;
}

/**
 * A login address an agent printed on its output.
 *
 * The address itself stays in the main process: what crosses is the host, so
 * the reader sees where the button leads before pressing it.
 */
export interface TerminalLink {
  id: string;
  host: string;
}
