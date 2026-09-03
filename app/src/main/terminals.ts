import type { WebContents } from "electron";
import * as pty from "node-pty";
import type { AgentState, TerminalKind } from "@shared/contract";

import { command, target } from "./ssh";

/**
 * Where the server keeps its projects, as it announced.
 *
 * A constant here would assume every machine is laid out like mine. The server
 * says so in its snapshot; until it has, we open the terminal in the login
 * folder rather than guess.
 */
let root: string | null = null;

export function setRoot(path: string): void {
  root = path;
}

type Session = {
  proc: pty.IPty;
  kind: TerminalKind;
  project: string | null;
  /** Last byte received from the PTY. */
  seenAt: number;
  /** Bytes received since the last keystroke: what the agent produced for you. */
  sinceKeystroke: number;
  /** A bell arrived and you have not answered yet. */
  bell: boolean;
  finished: boolean;
};

const sessions = new Map<string, Session>();

const STREAM_MS = 1200;
const ASLEEP_MS = 5 * 60 * 1000;
/** Below this, it is a keystroke echo or a redraw, not work. */
const MINIMUM_WORK = 200;

/**
 * A session's state, without ever reading what it displays.
 *
 * The bell is the clean signal — agents ring it when they hand back control. It
 * is not guaranteed, though: an agent may not ring it, or the setting may be
 * off. Hence the fallback on the stream: an agent that produced something and
 * then went quiet is waiting for you, bell or no bell.
 *
 * This reasoning only holds for an agent. A shell also goes quiet after writing,
 * and that means nothing more than "the command is done".
 */
function stateOf(session: Session): AgentState {
  if (session.finished) {
    return "finished";
  }

  const silence = Date.now() - session.seenAt;
  if (silence < STREAM_MS) {
    return "working";
  }

  const isAgent = session.kind === "claude" || session.kind === "codex";
  if (isAgent && (session.bell || session.sinceKeystroke > MINIMUM_WORK)) {
    return "attention";
  }

  return silence > ASLEEP_MS ? "asleep" : "idle";
}

export function states(): Record<string, AgentState> {
  const all: Record<string, AgentState> = {};
  for (const [id, session] of sessions) {
    all[id] = stateOf(session);
  }
  return all;
}

/**
 * The remote command, depending on what we want to open.
 *
 * `-tt` forces terminal allocation even when ssh does not deem it necessary:
 * without it, the server dashboard and Claude Code refuse to start, for want of
 * a TTY.
 *
 * The folder is quoted for the remote shell, and validated upstream by the
 * caller: nothing coming from the renderer reaches here without having been
 * compared to the project list the server gave.
 */
function remoteArgs(kind: TerminalKind, dir: string | null): string[] {
  const cd = dir && root ? `cd '${root}/${dir}' && ` : "";
  const base = ["-tt", ...target()];
  switch (kind) {
    case "shell":
      return [...base, `${cd}exec $SHELL -l`];
    case "claude":
      return [...base, `${cd}exec claude`];
    case "codex":
      return [...base, `${cd}exec codex`];
    case "tui":
      return [...base, `exec ${command()} tui`];
    default:
      return base;
  }
}

export function open(
  id: string,
  kind: TerminalKind,
  dir: string | null,
  project: string | null,
  cols: number,
  rows: number,
  recipient: WebContents
): void {
  close(id);

  const proc = pty.spawn("ssh", remoteArgs(kind, dir), {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  });

  proc.onData((data) => {
    const session = sessions.get(id);
    if (session) {
      session.seenAt = Date.now();
      session.sinceKeystroke += data.length;
      if (data.includes("\u0007")) {
        session.bell = true;
      }
    }
    if (!recipient.isDestroyed()) {
      recipient.send("terminal-data", { id, data });
    }
  });

  proc.onExit(({ exitCode }) => {
    const session = sessions.get(id);
    if (session) {
      session.finished = true;
    }
    if (!recipient.isDestroyed()) {
      recipient.send("terminal-exit", { id, code: exitCode });
    }
  });

  sessions.set(id, {
    proc,
    kind,
    project,
    seenAt: Date.now(),
    sinceKeystroke: 0,
    bell: false,
    finished: false,
  });
  watch(recipient);
}

let watcher: NodeJS.Timeout | null = null;
let lastSignature = "";

/**
 * Not every state change comes from an event: "working" becomes "idle" through
 * the passage of time alone. So we recompute them, but only send what moved.
 */
function watch(recipient: WebContents): void {
  if (watcher) {
    return;
  }
  watcher = setInterval(() => {
    if (sessions.size === 0) {
      clearInterval(watcher as NodeJS.Timeout);
      watcher = null;
      lastSignature = "";
      return;
    }
    const all = states();
    const signature = JSON.stringify(all);
    if (signature !== lastSignature && !recipient.isDestroyed()) {
      lastSignature = signature;
      recipient.send("terminal-states", all);
    }
  }, 600);
}

let keystrokesReceived = 0;

export function write(id: string, data: string): void {
  const session = sessions.get(id);
  if (!session) {
    return;
  }
  keystrokesReceived += data.length;
  // You have just answered: what the agent produced has been read, the ball is
  // in its court.
  session.bell = false;
  session.sinceKeystroke = 0;
  session.proc.write(data);
}

/** Enough to check, without guessing, that the keyboard really reaches the PTY. */
export function terminalDiagnostics(): {
  sessions: number;
  keystrokesReceived: number;
} {
  return { sessions: sessions.size, keystrokesReceived };
}

export function resize(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session || cols < 2 || rows < 2) {
    return;
  }
  try {
    session.proc.resize(cols, rows);
  } catch {
    // The process just died: the next read will report it.
  }
}

export function close(id: string): void {
  const session = sessions.get(id);
  if (!session) {
    return;
  }
  try {
    session.proc.kill();
  } catch {
    // Already dead.
  }
  sessions.delete(id);
}

export function closeAll(): void {
  for (const id of [...sessions.keys()]) {
    close(id);
  }
}
