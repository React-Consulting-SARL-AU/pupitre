import { spawn as spawnChild } from "node:child_process";
import type { AgentState, TerminalEnd, TerminalKind } from "@shared/terminals";
import type { WebContents } from "electron";
import * as pty from "node-pty";

import { current, terminalOptions } from "./platform";
import { targetOf } from "./servers";
import { createTerminalBatch, type TerminalBatch } from "./terminal-batch";
import { type LoginAddress, loginAddress } from "./terminal-links";
import { isSessionName } from "./terminal-run";
import { openScreen, type Screen } from "./terminal-screen";
import {
  type Activity,
  freshActivity,
  noteKeystroke,
  noteOutput,
  stateOf,
} from "./terminal-state";

interface Session extends Activity {
  proc: pty.IPty;
  serverId: string;
  project: string | null;
  screen: Screen;
  /** Kept out of the renderer: only its host crosses the bridge. */
  login: LoginAddress | null;
  batch: TerminalBatch;
}

const sessions = new Map<string, Session>();

const BELL = "\u0007";

function batchFor(recipient: WebContents) {
  return createTerminalBatch((id, data) => {
    if (!recipient.isDestroyed()) {
      recipient.send("terminal-data", { id, data });
    }
  });
}

export function states(): Record<string, AgentState> {
  const all: Record<string, AgentState> = {};
  const now = Date.now();

  for (const [id, session] of sessions) {
    all[id] = stateOf(session, now);
  }

  return all;
}

export interface OpenTerminal {
  id: string;
  serverId: string;
  kind: TerminalKind;
  project: string | null;
  /** The app's own for a shell, `agent.open`'s otherwise. */
  command: string;
  cols: number;
  rows: number;
}

function noteLogin(id: string, session: Session, recipient: WebContents): void {
  if (sessions.get(id) !== session) {
    return;
  }

  const found = loginAddress(
    session.screen.lines(),
    session.screen.cols(),
    session.login
  );

  if (!found || found.url === session.login?.url) {
    return;
  }

  session.login = found;

  if (!recipient.isDestroyed()) {
    recipient.send("terminal-link", { host: found.host, id });
  }
}

/** Another shell now holds this tab: what the old one still says is not the tab's. */
function replaced(id: string, proc: pty.IPty): boolean {
  const holder = sessions.get(id);

  return holder !== undefined && holder.proc !== proc;
}

/** `-tt` forces a TTY even when ssh deems none needed: without it, coding agents refuse to start. */
export function open(request: OpenTerminal, recipient: WebContents): void {
  const { id } = request;

  close(id);

  const batch = batchFor(recipient);
  const proc = pty.spawn(
    "ssh",
    ["-tt", ...targetOf(request.serverId), request.command],
    terminalOptions(request, current(), process.env)
  );

  proc.onData((data) => {
    if (replaced(id, proc)) {
      return;
    }

    const session = sessions.get(id);

    if (session) {
      noteOutput(session, data.length, Date.now());

      if (data.includes(BELL)) {
        session.bell = true;
      }

      session.screen.write(data, () => noteLogin(id, session, recipient));
    }

    batch.push(id, data);
  });

  proc.onExit(({ exitCode }) => {
    if (replaced(id, proc)) {
      return;
    }

    const session = sessions.get(id);

    if (session) {
      session.finished = true;
    }

    batch.flush();

    if (!recipient.isDestroyed()) {
      recipient.send("terminal-exit", { id, code: exitCode });
    }
  });

  sessions.set(id, {
    ...freshActivity(request.kind, Date.now()),
    proc,
    serverId: request.serverId,
    project: request.project,
    screen: openScreen(request.cols, request.rows),
    login: null,
    batch,
  });
  watch(recipient);
}

export function pendingLogin(id: string): LoginAddress | null {
  return sessions.get(id)?.login ?? null;
}

export function serverOf(id: string): string | null {
  return sessions.get(id)?.serverId ?? null;
}

export function describeSession(
  id: string
): { kind: TerminalKind; project: string | null } | null {
  const session = sessions.get(id);

  return session ? { kind: session.kind, project: session.project } : null;
}

let watcher: NodeJS.Timeout | null = null;
let lastSignature = "";
/** The window that last opened a session, not the first. */
let audience: WebContents | null = null;

type StatesListener = (states: Record<string, AgentState>) => void;

const listeners = new Set<StatesListener>();

export function onStates(listener: StatesListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function tell(all: Record<string, AgentState>): void {
  for (const listener of listeners) {
    listener(all);
  }
}

/** "working" turns "idle" through time alone, so states are recomputed on a timer and sent when they move. */
function watch(recipient: WebContents): void {
  audience = recipient;

  if (watcher) {
    return;
  }

  watcher = setInterval(() => {
    if (sessions.size === 0) {
      clearInterval(watcher as NodeJS.Timeout);
      watcher = null;
      lastSignature = "";
      audience = null;
      tell({});

      return;
    }

    const all = states();
    const signature = JSON.stringify(all);

    if (signature !== lastSignature && audience && !audience.isDestroyed()) {
      lastSignature = signature;
      audience.send("terminal-states", all);
      tell(all);
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
  noteKeystroke(session, Date.now());
  session.proc.write(data);
}

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

  session.screen.resize(cols, rows);

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

  session.screen.dispose();
  // A replacement opens under the same id: what this one still held is not its bytes to deliver.
  session.batch.drop(id);
  sessions.delete(id);
}

export function closeAll(): void {
  for (const id of [...sessions.keys()]) {
    close(id);
  }
}

export function closeFor(serverId: string): void {
  for (const [id, session] of [...sessions]) {
    if (session.serverId === serverId) {
      close(id);
    }
  }
}

function isEnd(value: unknown): value is TerminalEnd {
  const end = value as TerminalEnd | null;

  return (
    typeof end === "object" &&
    end !== null &&
    typeof end.serverId === "string" &&
    isSessionName(end.session)
  );
}

/** Quitting only lets go of the pipe, tmux keeps the session; closing a tab is what ends it for good. */
export function endSession(end: unknown): void {
  if (!isEnd(end)) {
    return;
  }

  const target = targetOf(end.serverId);

  if (target.length === 0) {
    return;
  }

  const killer = spawnChild(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      ...target,
      "tmux",
      "kill-session",
      "-t",
      end.session,
    ],
    { stdio: "ignore" }
  );

  killer.on("error", () => {
    // Out of reach: the session outlives the tab, and the next attach on that name finds it.
  });
  killer.unref();
}
