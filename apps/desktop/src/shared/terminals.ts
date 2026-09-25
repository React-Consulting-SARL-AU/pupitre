export type TerminalAgent =
  | "claude"
  | "codex"
  | "cursor"
  | "gemini"
  | "copilot"
  | "opencode"
  | "hermes";

export type TerminalKind = "shell" | TerminalAgent;

export interface TerminalSize {
  cols: number;
  rows: number;
}

export const TERMINAL_KINDS: readonly TerminalKind[] = [
  "shell",
  "claude",
  "codex",
  "cursor",
  "gemini",
  "copilot",
  "opencode",
  "hermes",
];

/** Inferred from the PTY stream, the bell and the exit, never from on-screen text that redesigns would break. */
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
  dir: string | null;
  session: string | null;
  /** Left by the last run and attached only when revisited, so a relaunch opens no session nobody asked for. */
  dormant: boolean;
}

export interface TerminalEnd {
  serverId: string;
  session: string;
}

export interface TerminalOpened {
  session: string | null;
}

/** The login address stays in the main process; only its host crosses, to show where the button leads. */
export interface TerminalLink {
  id: string;
  host: string;
}
