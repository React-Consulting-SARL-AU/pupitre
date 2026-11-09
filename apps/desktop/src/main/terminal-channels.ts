import type { AgentResponse } from "@shared/agent";
import {
  SCROLLBACK_MAX,
  SCROLLBACK_MIN,
  type TerminalOpened,
} from "@shared/terminals";
import { app, clipboard } from "electron";
import { agentClient } from "./agent";
import { workRoot } from "./completion";
import { releaseShell, reservedShell } from "./db-shell";
import { openOutside } from "./foreground";
import { handle, listen } from "./ipc";
import { anything, isNumber, isString, shape } from "./ipc-guard";
import { openable } from "./navigation";
import { awaitListening, closeForward, openForward } from "./port-forward";
import {
  declaresProject,
  projectAttach,
  projectFolder,
  projectPath,
} from "./projects-run";
import { refuseWith } from "./refusal";
import { byId } from "./servers";
import { forwardDeps } from "./services";
import {
  type LoginDeps,
  openFromTerminal,
  openPendingLogin,
  releaseForwards,
  rememberForward,
} from "./terminal-login";
import { isSessionName, terminalCommand } from "./terminal-run";
import {
  clearHistory,
  close,
  endSession,
  open,
  pendingLogin,
  resize,
  serverOf,
  terminalDiagnostics,
  write,
} from "./terminals";
import { trace } from "./trace";

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

function size(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 1 ? Math.floor(value) : fallback;
}

function history(value: unknown): number {
  return Math.min(size(value, SCROLLBACK_MIN), SCROLLBACK_MAX);
}

function registerTerminals(): void {
  handle("terminal-diagnostics", shape(), () => terminalDiagnostics());

  handle(
    "terminal-open",
    shape(
      anything,
      anything,
      anything,
      anything,
      anything,
      anything,
      anything,
      anything,
      anything
    ),
    async (
      event,
      id,
      serverId,
      kind,
      project,
      session,
      cols,
      rows,
      dir,
      scrollback
    ): Promise<AgentResponse<TerminalOpened>> => {
      if (!isString(id)) {
        return refuseWith("bad_request", "refusal.terminal.unknown");
      }

      // A reserved database shell runs the agent's command; nothing the renderer sends for it is trusted.
      const held = reservedShell(id, serverId);
      const decided = held
        ? { ok: true as const, result: held }
        : await terminalCommand(
            { dir, id, kind, project, serverId, session },
            {
              client: agentClient,
              declares: declaresProject,
              folder: projectFolder,
              knows: (candidate) => byId(candidate) !== null,
              path: projectPath,
              root: workRoot,
            }
          );

      if (!decided.ok) {
        return decided;
      }

      open(
        {
          cols: size(cols, DEFAULT_COLS),
          history: history(scrollback),
          id,
          kind: decided.result.kind,
          project: isString(project) ? project : null,
          rows: size(rows, DEFAULT_ROWS),
          serverId: String(serverId),
          tmux: decided.result.tmux,
        },
        event.sender
      );

      return { ok: true, result: { session: decided.result.session } };
    }
  );

  handle(
    "process-console-open",
    shape(isString, anything, anything, anything, anything, anything, anything),
    async (
      event,
      id,
      serverId,
      project,
      process,
      cols,
      rows,
      scrollback
    ): Promise<AgentResponse<TerminalOpened>> => {
      const answer = await projectAttach(serverId, project, process, {
        client: agentClient,
        knows: (candidate) => byId(candidate) !== null,
      });

      if (!answer.ok) {
        return answer;
      }

      const { session } = answer.result;

      if (!isSessionName(session)) {
        return refuseWith("internal", "refusal.agent.shape", {
          cmd: "project.attach",
        });
      }

      open(
        {
          cols: size(cols, DEFAULT_COLS),
          history: history(scrollback),
          id,
          kind: "process",
          project: String(project),
          rows: size(rows, DEFAULT_ROWS),
          serverId: String(serverId),
          // Quoted: zsh, dev's shell, would read `=name` as the path of a command.
          tmux: `attach-session -t '=${session}'`,
        },
        event.sender
      );

      return { ok: true, result: { session } };
    }
  );

  listen("terminal-write", shape(isString, isString), (_e, id, data) =>
    write(id, data)
  );

  listen("terminal-clear", shape(isString), (_e, id) => clearHistory(id));

  listen("terminal-copy", shape(isString), (_e, text) => {
    if (text.length > 0) {
      clipboard.writeText(text);
    }
  });

  listen(
    "terminal-resize",
    shape(isString, isNumber, isNumber),
    (_e, id, cols, rows) => resize(id, cols, rows)
  );

  listen("terminal-close", shape(isString, anything), (_e, id, end) => {
    releaseForwards(id, closeForward);
    releaseShell(id);
    close(id);
    endSession(end);
  });
}

/** Forwarded on the same local port, since the sign-in redirects to it, and held as long as the session. */
async function forwardLogin(
  id: string,
  serverId: string,
  port: number
): Promise<boolean> {
  const answer = await openForward(serverId, port, "login", forwardDeps, {
    localPort: port,
  });

  if (!answer.ok) {
    trace("login", `port ${port}: ${answer.error.message}`);

    return false;
  }

  rememberForward(id, answer.result.id);

  return awaitListening(port);
}

const loginDeps: LoginDeps = {
  forward: forwardLogin,
  openExternal: openOutside,
  openable: (url) => openable(url, app.isPackaged),
  pending: pendingLogin,
  serverOf,
};

/** The address opened is the one the session printed, never one the renderer sends. */
function registerLogins(): void {
  handle("login-open", shape(isString), (_e, id) =>
    openPendingLogin(id, loginDeps)
  );

  handle("terminal-open-url", shape(isString, isString), (_e, id, url) =>
    openFromTerminal(id, url, loginDeps)
  );
}

export function registerTerminalChannels(): void {
  registerTerminals();
  registerLogins();
}
