import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  CatalogResult,
  InstallReport,
  InstallResult,
  ModuleConfig,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type {
  ProjectActionResult,
  ProjectAddParams,
  ProjectAddResult,
  ProjectListResult,
  ProjectLogsResult,
  ProjectSyncResult,
  ProjectUrlResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { HelloResult } from "@pupitre/shared/agent-protocol/session";
import type { DoneResult } from "@pupitre/shared/agent-protocol/system";
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
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import type { AgentDelivery, InstallUpdate } from "@shared/install";
import type { SecretMarks } from "@shared/secrets";
import type {
  HostKeyDecision,
  ServerAdded,
  ServerDraft,
} from "@shared/servers";
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

  /**
   * The probe of a server, whether or not it already runs the agent. Nothing is
   * written on the machine: the script travels on standard input.
   */
  inspect: (serverId: string): Promise<AgentResponse<ProbeResult>> =>
    ipcRenderer.invoke("inspection:probe", serverId),

  /** The catalogue this server's agent declares. The app holds no list. */
  catalog: (serverId: string): Promise<AgentResponse<CatalogResult>> =>
    ipcRenderer.invoke("catalog:list", serverId),

  /**
   * A secret of the configuration screen, on its way in.
   *
   * It goes to the main process and stays there until the install writes it on
   * the protocol's secret line. What comes back is a mark, never a value.
   */
  setInstallSecret: (
    serverId: string,
    moduleId: string,
    key: string,
    value: string
  ): Promise<SecretMarks> =>
    ipcRenderer.invoke("catalog:secret-set", serverId, moduleId, key, value),
  generateInstallSecret: (
    serverId: string,
    moduleId: string,
    key: string
  ): Promise<SecretMarks> =>
    ipcRenderer.invoke("catalog:secret-generate", serverId, moduleId, key),

  /** The one way out, once: a second call answers `null`. */
  revealInstallSecret: (
    serverId: string,
    moduleId: string,
    key: string
  ): Promise<{ value: string | null; marks: SecretMarks }> =>
    ipcRenderer.invoke("catalog:secret-reveal", serverId, moduleId, key),
  forgetInstallSecrets: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("catalog:secret-forget", serverId),

  /**
   * The installation, from here to the report.
   *
   * The renderer names the modules and hands over their plain configuration;
   * the secrets it typed earlier are taken from the main process's vault at the
   * moment of the call and written on the protocol's secret line. Nothing of
   * them comes back through this bridge, not in an update, not in the result.
   */
  startInstall: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    onUpdate: (update: InstallUpdate) => void
  ): Promise<AgentResponse<InstallResult>> => {
    const token = crypto.randomUUID();
    const listener = (
      _e: unknown,
      payload: { token: string; update: InstallUpdate }
    ) => {
      if (payload.token === token) {
        onUpdate(payload.update);
      }
    };

    ipcRenderer.on("install:update", listener);

    return ipcRenderer
      .invoke("install:start", token, serverId, modules, config)
      .finally(() => ipcRenderer.removeListener("install:update", listener));
  },

  /**
   * The agent's binary, on its way to a machine that has none.
   *
   * It goes before the catalogue rather than with the install: a bare server
   * has nothing to answer `catalog` with until `pupitred` sits on it.
   */
  sendAgent: (serverId: string): Promise<AgentResponse<AgentDelivery>> =>
    ipcRenderer.invoke("install:agent-send", serverId),

  /**
   * The hardening, and the switch that follows it.
   *
   * The account is not a parameter: the protocol fixes it at `dev`. What comes
   * back says what the agent did, and whether the app now speaks to the server
   * as that account.
   */
  harden: (
    serverId: string,
    onUpdate: (update: HardenUpdate) => void
  ): Promise<AgentResponse<HardenOutcome>> => {
    const token = crypto.randomUUID();
    const listener = (
      _e: unknown,
      payload: { token: string; update: HardenUpdate }
    ) => {
      if (payload.token === token) {
        onUpdate(payload.update);
      }
    };

    ipcRenderer.on("harden:update", listener);

    return ipcRenderer
      .invoke("harden:start", token, serverId)
      .finally(() => ipcRenderer.removeListener("harden:update", listener));
  },

  /**
   * The projects of a server, and what drives them.
   *
   * A project is described once, on the way in; after that the renderer only
   * ever names it, and the main process checks that name against what the agent
   * itself declared before it becomes a command.
   */
  listProjects: (serverId: string): Promise<AgentResponse<ProjectListResult>> =>
    ipcRenderer.invoke("project:list", serverId),
  addProject: (
    serverId: string,
    params: ProjectAddParams
  ): Promise<AgentResponse<ProjectAddResult>> =>
    ipcRenderer.invoke("project:add", serverId, params),
  syncProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectSyncResult>> =>
    ipcRenderer.invoke("project:sync", serverId, name),
  installProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<DoneResult>> =>
    ipcRenderer.invoke("project:install", serverId, name),
  startProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectActionResult>> =>
    ipcRenderer.invoke("project:up", serverId, name),
  projectAddress: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectUrlResult>> =>
    ipcRenderer.invoke("project:url", serverId, name),

  /** The journal, read once or followed line by line until the project stops. */
  projectJournal: (
    serverId: string,
    name: string,
    lines: number,
    follow: boolean,
    onLine: (line: string) => void
  ): Promise<AgentResponse<ProjectLogsResult>> => {
    const token = crypto.randomUUID();
    const listener = (
      _e: unknown,
      payload: { token: string; line: string }
    ) => {
      if (payload.token === token) {
        onLine(payload.line);
      }
    };

    ipcRenderer.on("project:log-line", listener);

    return ipcRenderer
      .invoke("project:logs", token, serverId, name, lines, follow)
      .finally(() => ipcRenderer.removeListener("project:log-line", listener));
  },

  /** The last report the agent wrote, whatever happened to the channel. */
  installReport: (serverId: string): Promise<AgentResponse<InstallReport>> =>
    ipcRenderer.invoke("install:report", serverId),

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

  /**
   * Adding a server, and everything that follows from it.
   *
   * The renderer describes what it wants and gets back the public half plus the
   * line to paste. No private key crosses this bridge in either direction: a
   * key to import is designated through the system dialog, and copied into the
   * app's folder by the main process alone.
   */
  addServer: (draft: ServerDraft): Promise<AgentResponse<ServerAdded>> =>
    ipcRenderer.invoke("server-add", draft),
  renameServer: (id: string, name: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-rename", id, name),
  activateServer: (id: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-activate", id),
  removeServer: (id: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-remove", id),
  serverPublicKey: (id: string): Promise<string | null> =>
    ipcRenderer.invoke("server-public-key", id),
  pickKeyFile: (): Promise<string | null> =>
    ipcRenderer.invoke("key-file-pick"),

  hostKey: (id: string): Promise<AgentResponse<HostKeyDecision>> =>
    ipcRenderer.invoke("server-host-key", id),
  trustReinstalled: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("server-trust-reinstalled", id),
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
