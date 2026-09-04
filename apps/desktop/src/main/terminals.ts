import type { AgentState, TerminalKind } from "@shared/terminals";
import type { WebContents } from "electron";
import * as pty from "node-pty";

import { targetOf } from "./servers";
import { loginAddress } from "./terminal-links";

interface Session {
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
  /** The end of the stream, so an address cut between two chunks is still read. */
  tail: string;
  /** The login address this session last printed, kept out of the renderer. */
  login: { url: string; host: string } | null;
}

const sessions = new Map<string, Session>();

const STREAM_MS = 1200;
const ASLEEP_MS = 5 * 60 * 1000;
/** Below this, it is a keystroke echo or a redraw, not work. */
const MINIMUM_WORK = 200;
/** Long enough to hold the longest address an agent prints. */
const TAIL = 800;
const BELL = "\u0007";

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

  const isAgent = session.kind !== "shell";
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

export interface OpenTerminal {
  id: string;
  serverId: string;
  kind: TerminalKind;
  project: string | null;
  /** The remote command: the app's own for a shell, `agent.open`'s otherwise. */
  command: string;
  cols: number;
  rows: number;
}

/** The address stays here: only its host crosses the bridge. */
function noteLogin(id: string, session: Session, recipient: WebContents): void {
  const found = loginAddress(session.tail);

  if (!found || found.url === session.login?.url) {
    return;
  }

  session.login = found;

  if (!recipient.isDestroyed()) {
    recipient.send("terminal-link", { host: found.host, id });
  }
}

/**
 * The session, on the app's own SSH configuration.
 *
 * `-tt` forces terminal allocation even when ssh does not deem it necessary:
 * without it, an agent refuses to start, for want of a TTY. The command is a
 * single argument, and the remote login shell is the only thing to read it.
 */
export function open(request: OpenTerminal, recipient: WebContents): void {
  const { id } = request;

  close(id);

  const proc = pty.spawn(
    "ssh",
    ["-tt", ...targetOf(request.serverId), request.command],
    {
      name: "xterm-256color",
      cols: request.cols,
      rows: request.rows,
      cwd: process.env.HOME,
      env: process.env as Record<string, string>,
    }
  );

  proc.onData((data) => {
    const session = sessions.get(id);
    if (session) {
      session.seenAt = Date.now();
      session.sinceKeystroke += data.length;
      session.tail = (session.tail + data).slice(-TAIL);
      if (data.includes(BELL)) {
        session.bell = true;
      }
      noteLogin(id, session, recipient);
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
    kind: request.kind,
    project: request.project,
    seenAt: Date.now(),
    sinceKeystroke: 0,
    bell: false,
    finished: false,
    tail: "",
    login: null,
  });
  watch(recipient);
}

/** The address this session is waiting on, for whoever opens it. */
export function pendingLogin(id: string): { url: string; host: string } | null {
  return sessions.get(id)?.login ?? null;
}

/** Once used, an address is spent: a second click would replay a dead round. */
export function forgetLogin(id: string): void {
  const session = sessions.get(id);

  if (session) {
    session.login = null;
  }
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
