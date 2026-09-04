import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { HelloResult } from "@pupitre/shared/agent-protocol/session";
import type { AgentResponse } from "@shared/agent";
import type {
  Action,
  ActionResult,
  AgentState,
  Branches,
  Capabilities,
  Catalog,
  ConnectionState,
  FileDiff,
  GitStatus,
  LogLine,
  ProcessInfo,
  Registration,
  Secret,
  ServersConfig,
  Session,
  Snapshot,
  TerminalKind,
  WorkingTree,
} from "@shared/contract";
import { contextBridge, ipcRenderer } from "electron";

/**
 * The surface exposed to the renderer, and nothing more.
 *
 * No free-form command crosses this bridge: the renderer names a project and an
 * action, the main process decides what that becomes.
 */
const api = {
  /**
   * The agent protocol, as it stands: a command of `COMMANDS`, its parameters,
   * and the envelope the agent answered. The main process validates both before
   * anything reaches the channel.
   */
  agentCall: (
    serverId: string,
    cmd: CommandName,
    params?: unknown
  ): Promise<AgentResponse<unknown>> =>
    ipcRenderer.invoke("agent:call", serverId, cmd, params),

  /** The same call, with the events of a long command as they arrive. */
  agentStream: (
    serverId: string,
    cmd: CommandName,
    params: unknown,
    onEvent: (event: Event) => void
  ): Promise<AgentResponse<unknown>> => {
    const token = crypto.randomUUID();
    const listener = (
      _e: unknown,
      payload: { token: string; event: Event }
    ) => {
      if (payload.token === token) {
        onEvent(payload.event);
      }
    };

    ipcRenderer.on("agent:event", listener);

    return ipcRenderer
      .invoke("agent:stream", token, serverId, cmd, params)
      .finally(() => ipcRenderer.removeListener("agent:event", listener));
  },

  agentSession: (serverId: string): Promise<HelloResult | null> =>
    ipcRenderer.invoke("agent:session", serverId),
  agentClose: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("agent:close", serverId),

  snapshot: (): Promise<Snapshot | null> => ipcRenderer.invoke("snapshot"),
  capabilities: (): Promise<Capabilities> => ipcRenderer.invoke("capabilities"),
  top: (): Promise<ProcessInfo[]> => ipcRenderer.invoke("top"),
  terminalDiagnostics: (): Promise<{
    sessions: number;
    keystrokesReceived: number;
  }> => ipcRenderer.invoke("terminal-diagnostics"),
  sessions: (): Promise<Session[]> => ipcRenderer.invoke("sessions"),
  stopSession: (pid: number): Promise<ActionResult> =>
    ipcRenderer.invoke("session-stop", pid),
  stopProcess: (pid: number): Promise<ActionResult> =>
    ipcRenderer.invoke("process-stop", pid),
  rebootServer: (): Promise<ActionResult> =>
    ipcRenderer.invoke("server-reboot"),
  cleanSessions: (): Promise<ActionResult> =>
    ipcRenderer.invoke("sessions-clean"),
  branches: (project: string): Promise<Branches | null> =>
    ipcRenderer.invoke("branches", project),

  /**
   * The gap with the remote repository. "fetch" goes out to the network for what
   * is new — that is what costs, and that is why it has to be asked for.
   */
  gitStatus: (
    projects: string[] | null,
    fetch: boolean
  ): Promise<GitStatus[]> => ipcRenderer.invoke("git-status", projects, fetch),
  gitPull: (project: string): Promise<ActionResult> =>
    ipcRenderer.invoke("git-pull", project),

  /**
   * The working tree, and one file's diff. Both read-only, both local to the
   * server: nothing here writes to a repository, and nothing goes to the
   * network.
   */
  gitWorkingTree: (project: string): Promise<WorkingTree | null> =>
    ipcRenderer.invoke("git-worktree", project),
  gitFileDiff: (
    project: string,
    file: string,
    untracked: boolean
  ): Promise<FileDiff | null> =>
    ipcRenderer.invoke("git-file-diff", project, file, untracked),

  projects: (): Promise<Registration[]> => ipcRenderer.invoke("projects"),
  writeProject: (fields: Record<string, string>): Promise<ActionResult> =>
    ipcRenderer.invoke("project-write", fields),
  removeProject: (name: string): Promise<ActionResult> =>
    ipcRenderer.invoke("project-remove", name),

  secrets: (): Promise<Secret[]> => ipcRenderer.invoke("secrets"),
  setSecret: (key: string, value: string): Promise<ActionResult> =>
    ipcRenderer.invoke("secret-set", key, value),

  servers: (): Promise<ServersConfig> => ipcRenderer.invoke("servers"),
  sshHosts: (): Promise<string[]> => ipcRenderer.invoke("ssh-hosts"),
  saveServers: (config: ServersConfig): Promise<ServersConfig> =>
    ipcRenderer.invoke("servers-write", config),
  diagnose: (): Promise<ConnectionState> => ipcRenderer.invoke("diagnose"),
  installerPresent: (): Promise<boolean> =>
    ipcRenderer.invoke("installer-present"),
  install: (): Promise<{ code: number; output: string }> =>
    ipcRenderer.invoke("install"),

  action: (action: Action, project: string): Promise<ActionResult> =>
    ipcRenderer.invoke("action", action, project),
  switchBranch: (project: string, target: string): Promise<ActionResult> =>
    ipcRenderer.invoke("branch", project, target),

  openUrl: (url: string): Promise<void> => ipcRenderer.invoke("open-url", url),
  openEditor: (dir: string): Promise<void> =>
    ipcRenderer.invoke("open-editor", dir),

  followLog: (project: string): void => ipcRenderer.send("log-follow", project),
  stopLog: (project: string): void => ipcRenderer.send("log-stop", project),
  onLogLine: (callback: (line: LogLine) => void): (() => void) => {
    const listener = (_e: unknown, line: LogLine) => callback(line);
    ipcRenderer.on("log-line", listener);
    return () => ipcRenderer.removeListener("log-line", listener);
  },

  /**
   * The three sources of terminal autocompletion. The grammar comes from the
   * server, the history from its shell, the paths from its disk: nothing is
   * guessed here.
   */
  completionCatalog: (): Promise<Catalog | null> =>
    ipcRenderer.invoke("completion-catalog"),
  completionHistory: (): Promise<string[]> =>
    ipcRenderer.invoke("completion-history"),
  completionPaths: (dir: string, token: string): Promise<string[]> =>
    ipcRenderer.invoke("completion-paths", dir, token),

  openTerminal: (
    id: string,
    kind: TerminalKind,
    project: string | null,
    cols: number,
    rows: number
  ): void => ipcRenderer.send("terminal-open", id, kind, project, cols, rows),
  writeTerminal: (id: string, data: string): void =>
    ipcRenderer.send("terminal-write", id, data),
  resizeTerminal: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send("terminal-resize", id, cols, rows),
  closeTerminal: (id: string): void => ipcRenderer.send("terminal-close", id),
  onTerminalData: (
    callback: (payload: { id: string; data: string }) => void
  ): (() => void) => {
    const listener = (_e: unknown, payload: { id: string; data: string }) =>
      callback(payload);
    ipcRenderer.on("terminal-data", listener);
    return () => ipcRenderer.removeListener("terminal-data", listener);
  },
  onTerminalStates: (
    callback: (states: Record<string, AgentState>) => void
  ): (() => void) => {
    const listener = (_e: unknown, states: Record<string, AgentState>) =>
      callback(states);
    ipcRenderer.on("terminal-states", listener);
    return () => ipcRenderer.removeListener("terminal-states", listener);
  },
  onTerminalExit: (
    callback: (payload: { id: string; code: number }) => void
  ): (() => void) => {
    const listener = (_e: unknown, payload: { id: string; code: number }) =>
      callback(payload);
    ipcRenderer.on("terminal-exit", listener);
    return () => ipcRenderer.removeListener("terminal-exit", listener);
  },
};

export type PupitreApi = typeof api;

contextBridge.exposeInMainWorld("pupitre", api);
