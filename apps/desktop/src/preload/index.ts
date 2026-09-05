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
  ProjectBranchesResult,
  ProjectCheckoutResult,
  ProjectDiffResult,
  ProjectGitStatusResult,
  ProjectListResult,
  ProjectLogsResult,
  ProjectRemoveResult,
  ProjectSyncResult,
  ProjectUrlResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { SecretsStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { HelloResult } from "@pupitre/shared/agent-protocol/session";
import type { CompletionsResult } from "@pupitre/shared/agent-protocol/state";
import type {
  AgentUpgradeResult,
  DoneResult,
  EnrollResult,
} from "@pupitre/shared/agent-protocol/system";
import type {
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { AgentUpdateState } from "@shared/agent-update";
import type { Appearance } from "@shared/appearance";
import type { RemoteEditorId } from "@shared/editors";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import type { AgentDelivery, InstallUpdate } from "@shared/install";
import type { SecretMarks } from "@shared/secrets";
import type {
  FleetView,
  HostKeyDecision,
  ServerAdded,
  ServerDraft,
  ServersConfig,
} from "@shared/servers";
import type { PortForward, ServiceDetail } from "@shared/services";
import type {
  AgentState,
  TerminalKind,
  TerminalLink,
  TerminalOpened,
  ViewBounds,
} from "@shared/terminals";
import { contextBridge, ipcRenderer } from "electron";

/**
 * The surface exposed to the renderer, and nothing more.
 *
 * No free-form command crosses this bridge: the renderer names a server, a
 * project and an action, and the main process decides what that becomes.
 */

export type ProjectAction = "project.up" | "project.down" | "project.restart";

/** One update command, its events routed to the caller that started it. */
function streamedUpdate<T>(
  channel: string,
  onEvent: (event: Event) => void,
  ...args: unknown[]
): Promise<AgentResponse<T>> {
  const token = crypto.randomUUID();
  const listener = (_e: unknown, payload: { token: string; event: Event }) => {
    if (payload.token === token) {
      onEvent(payload.event);
    }
  };

  ipcRenderer.on("agent-update:event", listener);

  return ipcRenderer
    .invoke(channel, token, ...args)
    .finally(() => ipcRenderer.removeListener("agent-update:event", listener));
}

const api = {
  /**
   * The account, without its token.
   *
   * The bearer session lives in the operating system's keychain, read by the
   * main process at the moment of a call. What crosses here is who is signed
   * in, which device this computer is, and whether Pupitre may work.
   */
  account: (): Promise<AccountState> => ipcRenderer.invoke("account:state"),
  refreshAccount: (): Promise<AccountState> =>
    ipcRenderer.invoke("account:refresh"),
  signOut: (): Promise<AccountState> => ipcRenderer.invoke("account:sign-out"),

  /**
   * The device flow: a code to read out, a browser that opens on it, and the
   * wait until someone approves it in the console.
   */
  signIn: (
    onProgress: (progress: SignInProgress) => void
  ): Promise<AccountResponse<AccountState>> => {
    const token = crypto.randomUUID();
    const listener = (
      _e: unknown,
      payload: { token: string; progress: SignInProgress }
    ) => {
      if (payload.token === token) {
        onProgress(payload.progress);
      }
    };

    ipcRenderer.on("account:sign-in-progress", listener);

    return ipcRenderer
      .invoke("account:sign-in", token)
      .finally(() =>
        ipcRenderer.removeListener("account:sign-in-progress", listener)
      );
  },

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
  ): Promise<AgentResponse<SecretMarks>> =>
    ipcRenderer.invoke("catalog:secret-set", serverId, moduleId, key, value),
  generateInstallSecret: (
    serverId: string,
    moduleId: string,
    key: string
  ): Promise<AgentResponse<SecretMarks>> =>
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
  removeProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectRemoveResult>> =>
    ipcRenderer.invoke("project:on", "project.remove", serverId, name),
  syncProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectSyncResult>> =>
    ipcRenderer.invoke("project:on", "project.sync", serverId, name),
  installProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<DoneResult>> =>
    ipcRenderer.invoke("project:on", "project.install", serverId, name),
  projectAddress: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectUrlResult>> =>
    ipcRenderer.invoke("project:on", "project.url", serverId, name),
  projectBranches: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectBranchesResult>> =>
    ipcRenderer.invoke("project:on", "project.branches", serverId, name),

  /**
   * The gap with the remote repository: it goes out to the network for what is
   * new, which is why it is asked on opening a project and on demand, never
   * from a refresh loop.
   */
  projectGitStatus: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectGitStatusResult>> =>
    ipcRenderer.invoke("project:on", "project.git_status", serverId, name),
  projectWorkingTree: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectWorkingTreeResult>> =>
    ipcRenderer.invoke("project:on", "project.working_tree", serverId, name),
  projectDiff: (
    serverId: string,
    name: string,
    path: string
  ): Promise<AgentResponse<ProjectDiffResult>> =>
    ipcRenderer.invoke("project:diff", serverId, name, path),
  checkoutProject: (
    serverId: string,
    name: string,
    branch: string
  ): Promise<AgentResponse<ProjectCheckoutResult>> =>
    ipcRenderer.invoke("project:checkout", serverId, name, branch),

  /** Start, stop or restart one project — or "all", the agent's own word. */
  actOnProject: (
    action: ProjectAction,
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectActionResult>> =>
    ipcRenderer.invoke("project:act", action, serverId, name),

  startProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectActionResult>> =>
    ipcRenderer.invoke("project:act", "project.up", serverId, name),

  /**
   * The project's folder, opened in an editor of this computer.
   *
   * The renderer names the editor and the server; the absolute path is the one
   * the agent gave, held by the main process.
   */
  openInEditor: (
    serverId: string,
    editor: RemoteEditorId,
    path: string
  ): Promise<void> =>
    ipcRenderer.invoke("project:editor", serverId, editor, path),

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

  /**
   * The server's environment keys, and the one way a value reaches them.
   *
   * The value crosses once, on its way in, and is written on the protocol's
   * secret line by the main process. Nothing of it ever comes back.
   */
  secretsStatus: (
    serverId: string
  ): Promise<AgentResponse<SecretsStatusResult>> =>
    ipcRenderer.invoke("secrets:status", serverId),
  setSecret: (
    serverId: string,
    key: string,
    value: string
  ): Promise<AgentResponse<DoneResult>> =>
    ipcRenderer.invoke("secrets:set", serverId, key, value),

  /**
   * One installed module, as its own agent describes it.
   *
   * What comes back names the credentials it holds and nothing more: the values
   * stay in the main process, which shows one at a time and copies them without
   * ever handing one to this side.
   */
  serviceDetail: (
    serverId: string,
    moduleId: string
  ): Promise<AgentResponse<ServiceDetail>> =>
    ipcRenderer.invoke("service:detail", serverId, moduleId),

  /** The connection string of a database, filed with the other credentials. */
  databaseUrl: (
    serverId: string,
    moduleId: string,
    name?: string
  ): Promise<AgentResponse<{ label: string }>> =>
    ipcRenderer.invoke("service:db-url", serverId, moduleId, name ?? null),

  /** Shown once, to the reader who asked. Nothing keeps it afterwards. */
  revealCredential: (
    serverId: string,
    moduleId: string,
    label: string
  ): Promise<string | null> =>
    ipcRenderer.invoke("service:credential-reveal", serverId, moduleId, label),

  /** The clipboard is written on the other side: the value never comes here. */
  copyCredential: (
    serverId: string,
    moduleId: string,
    label: string
  ): Promise<boolean> =>
    ipcRenderer.invoke("service:credential-copy", serverId, moduleId, label),

  forgetCredentials: (serverId: string, moduleId?: string): Promise<void> =>
    ipcRenderer.invoke("service:forget", serverId, moduleId ?? null),

  /**
   * A port of the server, reachable from this computer while the forward lives.
   *
   * The renderer names a port and what it is for; the address, the account and
   * the key come from the app's own configuration.
   */
  openPortForward: (
    serverId: string,
    remotePort: number,
    label: string
  ): Promise<AgentResponse<PortForward>> =>
    ipcRenderer.invoke("service:forward-open", serverId, remotePort, label),
  closePortForward: (id: string): Promise<PortForward[]> =>
    ipcRenderer.invoke("service:forward-close", id),
  portForwards: (serverId: string): Promise<PortForward[]> =>
    ipcRenderer.invoke("service:forwards", serverId),

  /** The last report the agent wrote, whatever happened to the channel. */
  installReport: (serverId: string): Promise<AgentResponse<InstallReport>> =>
    ipcRenderer.invoke("install:report", serverId),

  /**
   * The agent this app carries against the one the server runs, and the two
   * gestures that follow from it.
   *
   * The version and the signature of an update are not parameters: they belong
   * to the release embedded in the app, and the main process is the only side
   * that reads them. This one names a server, and for the modules, names the
   * agent's own catalogue declared.
   */
  agentUpdateState: (
    serverId: string
  ): Promise<AgentResponse<AgentUpdateState>> =>
    ipcRenderer.invoke("agent-update:state", serverId),

  upgradeAgent: (
    serverId: string,
    onEvent: (event: Event) => void
  ): Promise<AgentResponse<AgentUpgradeResult>> =>
    streamedUpdate("agent-update:agent", onEvent, serverId),

  upgradeModules: (
    serverId: string,
    modules: readonly string[],
    onEvent: (event: Event) => void
  ): Promise<AgentResponse<InstallResult>> =>
    streamedUpdate("agent-update:modules", onEvent, serverId, modules),

  /**
   * The repair of a server the platform no longer vouches for.
   *
   * The renderer names a server and nothing else: the fresh enrolment token is
   * asked of the platform by the main process and written on the protocol's
   * secret line. It never crosses this bridge, in either direction.
   */
  reenrollServer: (serverId: string): Promise<AgentResponse<EnrollResult>> =>
    ipcRenderer.invoke("reenroll:start", serverId),

  agentSession: (serverId: string): Promise<HelloResult | null> =>
    ipcRenderer.invoke("agent:session", serverId),
  agentClose: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("agent:close", serverId),

  servers: (): Promise<ServersConfig> => ipcRenderer.invoke("servers"),

  /**
   * The servers the platform grants this account, merged into the local list.
   *
   * The renderer sends nothing and gets back both lists: what the platform
   * said, and what the app now knows. Opening one names it by its local
   * identifier; the address and the key are never named here.
   */
  fleet: (): Promise<AgentResponse<FleetView>> =>
    ipcRenderer.invoke("fleet:list"),
  openGrantedServer: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("fleet:open", id),

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

  openUrl: (url: string): Promise<void> => ipcRenderer.invoke("open-url", url),

  /**
   * The theme the renderer just resolved, on its way to the native frame.
   *
   * Without it the window paints its edges from the system while the settings
   * force the other theme, and a resize shows the wrong colour.
   */
  setAppearance: (appearance: Appearance): void =>
    ipcRenderer.send("appearance:set", appearance),

  /** The grammar, the projects and one folder, in one command of the protocol. */
  completions: (
    serverId: string,
    path?: string
  ): Promise<AgentResponse<CompletionsResult>> =>
    ipcRenderer.invoke("completions", serverId, path ?? ""),

  terminalDiagnostics: (): Promise<{
    sessions: number;
    keystrokesReceived: number;
  }> => ipcRenderer.invoke("terminal-diagnostics"),

  /** The renderer names a kind and a project; the command is decided over there. */
  openTerminal: (
    id: string,
    serverId: string,
    kind: TerminalKind,
    project: string | null,
    cols: number,
    rows: number
  ): Promise<AgentResponse<TerminalOpened>> =>
    ipcRenderer.invoke(
      "terminal-open",
      id,
      serverId,
      kind,
      project,
      cols,
      rows
    ),
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

  /** The address never crosses: this side names a session and a rectangle. */
  onTerminalLink: (callback: (link: TerminalLink) => void): (() => void) => {
    const listener = (_e: unknown, link: TerminalLink) => callback(link);
    ipcRenderer.on("terminal-link", listener);
    return () => ipcRenderer.removeListener("terminal-link", listener);
  },
  openLogin: (id: string, bounds: ViewBounds): Promise<boolean> =>
    ipcRenderer.invoke("login-open", id, bounds),
  moveLogin: (bounds: ViewBounds): void =>
    ipcRenderer.send("login-move", bounds),
  closeLogin: (): void => ipcRenderer.send("login-close"),
  onLoginClosed: (callback: (id: string) => void): (() => void) => {
    const listener = (_e: unknown, id: string) => callback(id);
    ipcRenderer.on("login-closed", listener);
    return () => ipcRenderer.removeListener("login-closed", listener);
  },
};

export type PupitreApi = typeof api;

contextBridge.exposeInMainWorld("pupitre", api);
