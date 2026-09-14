import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  CatalogResult,
  InstallCheckResult,
  InstallReport,
  InstallResult,
  ModuleConfig,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentMigrateResult } from "@pupitre/shared/agent-protocol/migrate";
import type {
  ProjectActionResult,
  ProjectAddParams,
  ProjectAddResult,
  ProjectBranchesResult,
  ProjectCheckoutResult,
  ProjectDiffResult,
  ProjectEnvResult,
  ProjectGitStatusResult,
  ProjectInstallResult,
  ProjectListResult,
  ProjectLogsResult,
  ProjectPullResult,
  ProjectRemoveResult,
  ProjectSyncResult,
  ProjectUpdateParams,
  ProjectUpdateResult,
  ProjectUrlResult,
  ProjectWorkingTreeResult,
} from "@pupitre/shared/agent-protocol/projects";
import type { TunnelRoute } from "@pupitre/shared/agent-protocol/secrets";
import type { HelloResult } from "@pupitre/shared/agent-protocol/session";
import type {
  CompletionsResult,
  ServiceLogsResult,
} from "@pupitre/shared/agent-protocol/state";
import type {
  EnrollResult,
  PlatformSyncResult,
} from "@pupitre/shared/agent-protocol/system";
import type {
  AccountDevice,
  AccountResponse,
  AccountState,
  SignInProgress,
} from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type {
  AgentUpdateState,
  AgentUpgradeOutcome,
} from "@shared/agent-update";
import type { AppAbout, AppUpdateState } from "@shared/app-update";
import type { Appearance } from "@shared/appearance";
import type { CloudflareZone } from "@shared/cloudflare";
import type {
  ConnectionCheck,
  ConnectionKind,
  ConnectionOutcome,
  ConnectionsState,
} from "@shared/connections";
import type { DevDefaults } from "@shared/dev";
import type { RemoteEditorId } from "@shared/editors";
import type { GithubRepo } from "@shared/github";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import type {
  AgentDelivery,
  AgentSendPhase,
  InstallUpdate,
} from "@shared/install";
import type { SecretMarks } from "@shared/secrets";
import type {
  FleetView,
  HostKeyDecision,
  KeyInstall,
  KeyInstallPhase,
  ServerAdded,
  ServerChanges,
  ServerDraft,
  ServerKnock,
  ServerReach,
  ServersConfig,
  ServerUpdated,
} from "@shared/servers";
import type {
  DatabaseShell,
  PortForward,
  ServiceDetail,
} from "@shared/services";
import type { DeepLink, MenuCommand } from "@shared/shell";
import type { StartupState } from "@shared/startup";
import type {
  AgentState,
  TerminalEnd,
  TerminalKind,
  TerminalLink,
  TerminalOpened,
} from "@shared/terminals";
import type { TraceEntry } from "@shared/trace";
import type { TransferList } from "@shared/transfers";
import { contextBridge, ipcRenderer, webUtils } from "electron";

/**
 * The surface exposed to the renderer, and nothing more.
 *
 * No free-form command crosses this bridge: the renderer names a server, a
 * project and an action, and the main process decides what that becomes.
 */

export type ProjectAction = "project.up" | "project.down" | "project.restart";

/**
 * One long command, its events routed to the caller that started it.
 *
 * Every caller of a channel hears the same event channel, so the call carries a
 * token the main process sends back with each payload: without it, two installs
 * side by side would each draw the other's progress. The listener leaves when
 * the call settles, whichever way it settles.
 */
function streamed<Result, Payload>(
  call: string,
  events: string,
  onPayload: (payload: Payload) => void,
  ...args: unknown[]
): Promise<Result> {
  const token = crypto.randomUUID();
  const listener = (_e: unknown, payload: Payload & { token: string }) => {
    if (payload.token === token) {
      onPayload(payload);
    }
  };

  ipcRenderer.on(events, listener);

  return ipcRenderer
    .invoke(call, token, ...args)
    .finally(() => ipcRenderer.removeListener(events, listener));
}

/**
 * A stream whose events must all have landed before its answer is trusted.
 *
 * The answer of an invoke travels on another pipe than the events and can
 * overtake the ones sent just before it. The main process says `end` on the
 * event channel once the last event is out; an answered stream waits for that
 * word before it settles, so a receipt never counts chunks that are still on
 * their way. A refused stream sent nothing and is not waited on.
 */
function streamedToEnd<Result extends { ok: boolean }, Payload>(
  call: string,
  events: string,
  onPayload: (payload: Payload) => void,
  ...args: unknown[]
): Promise<Result> {
  const token = crypto.randomUUID();
  let ended: () => void = () => undefined;
  const end = new Promise<void>((resolve) => {
    ended = resolve;
  });
  const listener = (
    _e: unknown,
    payload: (Payload | { end: true }) & { token: string }
  ) => {
    if (payload.token !== token) {
      return;
    }

    if ("end" in payload) {
      ended();
    } else {
      onPayload(payload);
    }
  };

  ipcRenderer.on(events, listener);

  return ipcRenderer
    .invoke(call, token, ...args)
    .then(async (answer: Result) => {
      if (answer.ok) {
        await end;
      }

      return answer;
    })
    .finally(() => ipcRenderer.removeListener(events, listener));
}

/**
 * A stream the caller can end: what `done` settles with, and a way to say
 * "enough" before the machine has said its last word.
 *
 * Two fields rather than a promise with a method on it: the bridge copies a
 * promise into a new one and keeps nothing else, so a `cancel` hung on it
 * would never reach the page.
 */
export interface Followed<Result> {
  done: Promise<Result>;
  cancel: () => void;
}

function followed<Result, Payload>(
  call: string,
  events: string,
  cancel: string,
  onPayload: (payload: Payload) => void,
  ...args: unknown[]
): Followed<Result> {
  const token = crypto.randomUUID();
  const listener = (_e: unknown, payload: Payload & { token: string }) => {
    if (payload.token === token) {
      onPayload(payload);
    }
  };

  ipcRenderer.on(events, listener);

  return {
    cancel: () => ipcRenderer.send(cancel, token),
    done: ipcRenderer
      .invoke(call, token, ...args)
      .finally(() => ipcRenderer.removeListener(events, listener)),
  };
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
  /** The app's language: the agent gets it on the next hello. */
  setLocale: (locale: string): void => ipcRenderer.send("locale:set", locale),
  /** Switches this device's active organization. The console alongside it keeps its own. */
  switchOrganization: (organizationId: string): Promise<AccountState> =>
    ipcRenderer.invoke("account:organization", organizationId),
  refreshAccount: (): Promise<AccountState> =>
    ipcRenderer.invoke("account:refresh"),
  signOut: (): Promise<AccountState> => ipcRenderer.invoke("account:sign-out"),
  /** The devices the platform holds for this account; the keys never come down. */
  accountDevices: (): Promise<AgentResponse<AccountDevice[]>> =>
    ipcRenderer.invoke("account:devices"),
  /** Revokes another device: its key stops opening the granted servers. */
  revokeDevice: (deviceId: string): Promise<AgentResponse<null>> =>
    ipcRenderer.invoke("account:device-revoke", deviceId),

  /**
   * The device flow: a code to read out, a browser that opens on it, and the
   * wait until someone approves it in the console.
   */
  signIn: (
    onProgress: (progress: SignInProgress) => void
  ): Promise<AccountResponse<AccountState>> =>
    streamed<AccountResponse<AccountState>, { progress: SignInProgress }>(
      "account:sign-in",
      "account:sign-in-progress",
      (payload) => onProgress(payload.progress)
    ),

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

  /**
   * The same command, read on a timer: it rides the beat channel, so a
   * gesture never waits behind the dashboard's next read.
   */
  agentPoll: (
    serverId: string,
    cmd: CommandName,
    params?: unknown
  ): Promise<AgentResponse<unknown>> =>
    ipcRenderer.invoke("agent:call", serverId, cmd, params, true),

  /** The same call, with the events of a long command as they arrive. */
  agentStream: (
    serverId: string,
    cmd: CommandName,
    params: unknown,
    onEvent: (event: Event) => void
  ): Promise<AgentResponse<unknown>> =>
    streamedToEnd<AgentResponse<unknown>, { event: Event }>(
      "agent:stream",
      "agent:event",
      (payload) => onEvent(payload.event),
      serverId,
      cmd,
      params
    ),

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
    onUpdate: (update: InstallUpdate) => void,
    /** Modules to put on the machine without configuring: their questions wait. */
    defer: readonly string[] = []
  ): Promise<AgentResponse<InstallResult>> =>
    streamed<AgentResponse<InstallResult>, { update: InstallUpdate }>(
      "install:start",
      "install:update",
      (payload) => onUpdate(payload.update),
      serverId,
      modules,
      config,
      defer
    ),

  /**
   * The agent's binary, on its way to a machine that has none.
   *
   * It goes before the catalogue rather than with the install: a bare server
   * has nothing to answer `catalog` with until `pupitred` sits on it.
   */
  sendAgent: (
    serverId: string,
    onPhase: (phase: AgentSendPhase) => void
  ): Promise<AgentResponse<AgentDelivery>> =>
    streamed<AgentResponse<AgentDelivery>, { phase: AgentSendPhase }>(
      "install:agent-send",
      "install:agent-phase",
      (payload) => onPhase(payload.phase),
      serverId
    ),

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
  ): Promise<AgentResponse<HardenOutcome>> =>
    streamed<AgentResponse<HardenOutcome>, { update: HardenUpdate }>(
      "harden:start",
      "harden:update",
      (payload) => onUpdate(payload.update),
      serverId
    ),

  /**
   * The projects of a server, and what drives them.
   *
   * A project is described once, on the way in; after that the renderer only
   * ever names it, and the main process checks that name against what the agent
   * itself declared before it becomes a command.
   */
  listProjects: (serverId: string): Promise<AgentResponse<ProjectListResult>> =>
    ipcRenderer.invoke("project:list", serverId),
  /**
   * The third-party accounts the app holds, once for every server.
   *
   * The token crosses the bridge once, on connection, and goes straight to the
   * system keychain: nothing gives it back, and it never comes down here again.
   * What the window learns is the name of the account it opened.
   */
  connectionsState: (): Promise<ConnectionsState> =>
    ipcRenderer.invoke("connections:state"),
  /** A token that opens several accounts comes back as a choice; the pick is sent with the token again. */
  connectAccount: (
    kind: ConnectionKind,
    token: string,
    accountId?: string
  ): Promise<AgentResponse<ConnectionOutcome>> =>
    ipcRenderer.invoke("connections:connect", kind, token, accountId),
  forgetAccount: (kind: ConnectionKind): Promise<ConnectionsState> =>
    ipcRenderer.invoke("connections:forget", kind),
  /** Asks the provider again whether the held token still opens an account. */
  verifyAccount: (
    kind: ConnectionKind
  ): Promise<AgentResponse<ConnectionCheck>> =>
    ipcRenderer.invoke("connections:verify", kind),
  /** The zones the connected account carries, read fresh rather than remembered. */
  connectionZones: (): Promise<AgentResponse<CloudflareZone[]>> =>
    ipcRenderer.invoke("connections:zones"),
  /**
   * The repositories of the connected GitHub account.
   *
   * The token that reads them stays in the main process; what comes down is a
   * list to pick from. It is held there for a few minutes, and `refresh` is the
   * reader asking for it again.
   */
  githubRepos: (refresh = false): Promise<AgentResponse<GithubRepo[]>> =>
    ipcRenderer.invoke("github:repos", refresh),
  /**
   * The configuration weighed on the server before it is installed.
   *
   * No secret goes with it and nothing is touched: what comes back is what the
   * server would refuse, field by field, including what only it can know.
   */
  checkInstall: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    defer: readonly string[] = []
  ): Promise<AgentResponse<InstallCheckResult>> =>
    ipcRenderer.invoke("install:check", serverId, modules, config, defer),
  /**
   * The link to a server, as it drops and comes back.
   *
   * It belongs to no call in particular: the command in flight learns of it
   * through its own refusal, and the screens learn of it here.
   */
  onChannel: (
    callback: (change: { serverId: string; state: "open" | "lost" }) => void
  ): (() => void) => {
    const listener = (
      _event: unknown,
      change: { serverId: string; state: "open" | "lost" }
    ) => callback(change);

    ipcRenderer.on("agent:channel", listener);

    return () => {
      ipcRenderer.removeListener("agent:channel", listener);
    };
  },
  /**
   * The platform, told now rather than at the daemon's next turn.
   *
   * An installation or a hardening has just changed the machine: without this
   * the console shows an empty server for the next five minutes. A failure is
   * not the caller's business — the daemon beats again on its own.
   */
  syncPlatform: (
    serverId: string
  ): Promise<AgentResponse<PlatformSyncResult>> =>
    ipcRenderer.invoke("platform:sync", serverId),
  /** The records called for by the routes the agent just declared. */
  releaseTunnelRecords: (
    serverId: string,
    hostnames: readonly string[]
  ): Promise<AgentResponse<number>> =>
    ipcRenderer.invoke("tunnel:release", serverId, hostnames),
  syncTunnelRecords: (
    serverId: string,
    routes: readonly TunnelRoute[]
  ): Promise<AgentResponse<number>> =>
    ipcRenderer.invoke("tunnel:records", serverId, routes),
  addProject: (
    serverId: string,
    params: ProjectAddParams
  ): Promise<AgentResponse<ProjectAddResult>> =>
    ipcRenderer.invoke("project:add", serverId, params),
  updateProject: (
    serverId: string,
    params: ProjectUpdateParams
  ): Promise<AgentResponse<ProjectUpdateResult>> =>
    ipcRenderer.invoke("project:update", serverId, params),
  removeProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectRemoveResult>> =>
    ipcRenderer.invoke("project:on", "project.remove", serverId, name),
  pullProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectPullResult>> =>
    ipcRenderer.invoke("project:on", "project.pull", serverId, name),
  syncProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectSyncResult>> =>
    ipcRenderer.invoke("project:on", "project.sync", serverId, name),
  installProject: (
    serverId: string,
    name: string
  ): Promise<AgentResponse<ProjectInstallResult>> =>
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
  /** The keys of a project's environment file, never a value; `force` writes it again, `process` names the folder it lives in. */
  projectEnv: (
    serverId: string,
    name: string,
    force = false,
    process?: string
  ): Promise<AgentResponse<ProjectEnvResult>> =>
    ipcRenderer.invoke("project:env", serverId, name, force, process ?? null),

  /** Start, stop or restart one project — or "all", the agent's own word — or one process of a project. */
  actOnProject: (
    action: ProjectAction,
    serverId: string,
    name: string,
    process?: string
  ): Promise<AgentResponse<ProjectActionResult>> =>
    ipcRenderer.invoke("project:act", action, serverId, name, process ?? null),

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

  /** The journal of one process, read once or followed line by line until it stops. */
  projectJournal: (
    serverId: string,
    name: string,
    process: string,
    lines: number,
    follow: boolean,
    onLine: (line: string) => void
  ): Promise<AgentResponse<ProjectLogsResult>> =>
    followed<AgentResponse<ProjectLogsResult>, { line: string }>(
      "project:logs",
      "project:log-line",
      "project:logs-cancel",
      (payload) => onLine(payload.line),
      serverId,
      name,
      process,
      lines,
      follow
    ).done,

  /**
   * The journal followed until the reader leaves it.
   *
   * `done` settles when the project stops, when the link drops, or with a
   * `cancelled` refusal once `cancel` is called — and the agent is cut short
   * then, rather than left writing for nobody.
   */
  followProjectJournal: (
    serverId: string,
    name: string,
    process: string,
    lines: number,
    onLine: (line: string) => void
  ): Followed<AgentResponse<ProjectLogsResult>> =>
    followed<AgentResponse<ProjectLogsResult>, { line: string }>(
      "project:logs",
      "project:log-line",
      "project:logs-cancel",
      (payload) => onLine(payload.line),
      serverId,
      name,
      process,
      lines,
      true
    ),

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
  /** Every forward open on this computer, or those of one server. */
  portForwards: (serverId?: string): Promise<PortForward[]> =>
    ipcRenderer.invoke("service:forwards", serverId ?? null),
  /** The list whole, every time it changes — a forward can die on its own. */
  onPortForwards: (
    listener: (forwards: PortForward[]) => void
  ): (() => void) => {
    const handler = (_e: unknown, list: PortForward[]) => listener(list);

    ipcRenderer.on("service:forwards-changed", handler);

    return () =>
      ipcRenderer.removeListener("service:forwards-changed", handler);
  },

  /**
   * The shell of a database, as a terminal tab rather than a line to paste.
   *
   * The renderer names the module and, at most, a database; the command the
   * agent composes stays in the main process under the tab it answers with,
   * and `openTerminal` on that tab runs it.
   */
  openDatabaseShell: (
    serverId: string,
    moduleId: string,
    name?: string
  ): Promise<AgentResponse<DatabaseShell>> =>
    ipcRenderer.invoke("service:db-shell", serverId, moduleId, name ?? null),

  /** A service's journal, followed until the reader leaves it. */
  followServiceJournal: (
    serverId: string,
    moduleId: string,
    lines: number,
    onLine: (line: string) => void
  ): Followed<AgentResponse<ServiceLogsResult>> =>
    followed<AgentResponse<ServiceLogsResult>, { line: string }>(
      "service:logs",
      "service:log-line",
      "service:logs-cancel",
      (payload) => onLine(payload.line),
      serverId,
      moduleId,
      lines,
      true
    ),

  /**
   * The files on their way between this computer and a server.
   *
   * They ride their own `rsync` — or `scp` — on the app's SSH configuration,
   * never the agent's channel. The renderer names a server and a path under
   * the agent's root; the local path is always one the user pointed at, in a
   * dialog opened here or by dropping a file, and never a string of its own.
   */
  transfers: (): Promise<TransferList> => ipcRenderer.invoke("transfer:list"),
  startUpload: (
    serverId: string,
    remoteDir: string,
    localPaths: readonly string[]
  ): Promise<AgentResponse<TransferList>> =>
    ipcRenderer.invoke("transfer:upload", serverId, remoteDir, localPaths),
  startDownload: (
    serverId: string,
    remotePath: string,
    localPath: string
  ): Promise<AgentResponse<TransferList>> =>
    ipcRenderer.invoke("transfer:download", serverId, remotePath, localPath),
  pauseTransfer: (id: string): Promise<TransferList> =>
    ipcRenderer.invoke("transfer:pause", id),
  resumeTransfer: (id: string): Promise<TransferList> =>
    ipcRenderer.invoke("transfer:resume", id),
  cancelTransfer: (id: string): Promise<TransferList> =>
    ipcRenderer.invoke("transfer:cancel", id),
  dismissTransfer: (id: string): Promise<TransferList> =>
    ipcRenderer.invoke("transfer:dismiss", id),
  onTransfers: (listener: (list: TransferList) => void): (() => void) => {
    const handler = (_e: unknown, list: TransferList) => listener(list);

    ipcRenderer.on("transfer:changed", handler);

    return () => ipcRenderer.removeListener("transfer:changed", handler);
  },
  /**
   * The path of a file dropped on the window.
   *
   * The sandboxed page sees a `File` with no path; this side reads it and
   * tells the main process, which accepts a local path only once it was
   * pointed at this way or through one of its dialogs.
   */
  pathOfDroppedFile: (file: File): Promise<string | null> =>
    ipcRenderer.invoke("transfer:dropped", webUtils.getPathForFile(file)),
  pickUploadPaths: (): Promise<string[]> =>
    ipcRenderer.invoke("transfer:pick-upload"),
  pickSavePath: (name: string): Promise<string | null> =>
    ipcRenderer.invoke("transfer:pick-save", name),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("transfer:pick-folder"),
  /**
   * A capture written where the save dialog pointed: the bytes the window
   * already holds, and the path `pickSavePath` just returned — no other.
   */
  saveShot: (
    path: string,
    bytes: Uint8Array
  ): Promise<AgentResponse<{ path: string }>> =>
    ipcRenderer.invoke("shots:save", path, bytes),

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
  ): Promise<AgentResponse<AgentUpgradeOutcome>> =>
    streamed<AgentResponse<AgentUpgradeOutcome>, { event: Event }>(
      "agent-update:agent",
      "agent-update:event",
      (payload) => onEvent(payload.event),
      serverId
    ),

  /**
   * The configuration on the server brought to the shape the agent now reads.
   *
   * `upgradeAgent` already asks for it, right after the binary changed. This is
   * the second attempt after a migration refused, and the answer is null for an
   * agent from before the ledger.
   */
  migrateAgentConfig: (
    serverId: string
  ): Promise<AgentResponse<AgentMigrateResult | null>> =>
    ipcRenderer.invoke("agent-update:migrate", serverId),

  upgradeModules: (
    serverId: string,
    modules: readonly string[],
    onEvent: (event: Event) => void
  ): Promise<AgentResponse<InstallResult>> =>
    streamed<AgentResponse<InstallResult>, { event: Event }>(
      "agent-update:modules",
      "agent-update:event",
      (payload) => onEvent(payload.event),
      serverId,
      modules
    ),

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
  restoreGrantedServers: (): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("fleet:restore"),

  sshHosts: (): Promise<string[]> => ipcRenderer.invoke("ssh-hosts"),

  /**
   * Adding a server, and everything that follows from it.
   *
   * The renderer describes what it wants and gets back the public half plus the
   * line to paste. No private key crosses this bridge in either direction: a
   * key to import is designated through the system dialog, and copied into the
   * app's folder by the main process alone.
   */
  /**
   * Whether an address answers, answers SSH, and what would open the account.
   * It runs before a server is declared, so it takes what the form has rather
   * than an id, and the password it may call for goes with `addServer`.
   */
  reachServer: (target: ServerKnock): Promise<ServerReach> =>
    ipcRenderer.invoke("server-reach", target),

  addServer: (draft: ServerDraft): Promise<AgentResponse<ServerAdded>> =>
    ipcRenderer.invoke("server-add", draft),
  renameServer: (id: string, name: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-rename", id, name),
  activateServer: (id: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-activate", id),
  /**
   * The address, the port or the account of a server, changed in place. The
   * pinned host key goes with the old address, and the answer says so.
   */
  updateServer: (
    id: string,
    changes: ServerChanges
  ): Promise<AgentResponse<ServerUpdated>> =>
    ipcRenderer.invoke("server-update", id, changes),
  removeServer: (id: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-remove", id),

  /** Removes the server from this computer and erases it from the platform. */
  forgetServer: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("server-forget", id),
  serverPublicKey: (id: string): Promise<string | null> =>
    ipcRenderer.invoke("server-public-key", id),
  pickKeyFile: (): Promise<string | null> =>
    ipcRenderer.invoke("key-file-pick"),

  /**
   * Installing the app's key on a server it has just added.
   *
   * The password goes one way and is never held: it crosses on this call, the
   * main process hands it to one `ssh` and forgets it. What comes back says
   * whether the machine opens, whether a password would help, or that the app
   * has to hand the line over after all.
   */
  installKey: (
    serverId: string,
    password: string | null,
    onPhase: (phase: KeyInstallPhase) => void
  ): Promise<AgentResponse<KeyInstall>> =>
    streamed<AgentResponse<KeyInstall>, { phase: KeyInstallPhase }>(
      "server-key-install",
      "server-key-install:phase",
      (payload) => onPhase(payload.phase),
      serverId,
      password
    ),

  /**
   * What the main process does, for the devtools console. Nothing arrives in a
   * packaged build: the trace is off there, and nobody emits.
   */
  onTrace: (listener: (entry: TraceEntry) => void): (() => void) => {
    const handler = (_e: unknown, entry: TraceEntry) => listener(entry);

    ipcRenderer.on("trace", handler);

    return () => ipcRenderer.removeListener("trace", handler);
  },

  hostKey: (id: string): Promise<AgentResponse<HostKeyDecision>> =>
    ipcRenderer.invoke("server-host-key", id),
  trustReinstalled: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("server-trust-reinstalled", id),

  openUrl: (url: string): Promise<void> => ipcRenderer.invoke("open-url", url),

  /**
   * A gesture the native menu asked for: the window performs it as it would a
   * click, with its own confirmation where one exists.
   */
  onMenuCommand: (listener: (command: MenuCommand) => void): (() => void) => {
    const handler = (_e: unknown, command: MenuCommand) => listener(command);

    ipcRenderer.on("menu:command", handler);

    return () => ipcRenderer.removeListener("menu:command", handler);
  },

  /** A `pupitre://` link the main process has already checked, as a navigation. */
  onDeepLink: (listener: (link: DeepLink) => void): (() => void) => {
    const handler = (_e: unknown, link: DeepLink) => listener(link);

    ipcRenderer.on("deep-link", handler);

    return () => ipcRenderer.removeListener("deep-link", handler);
  },
  /** The link the app was opened with, before this page could listen; handed over once. */
  pendingDeepLink: (): Promise<DeepLink | null> =>
    ipcRenderer.invoke("deep-link:pending"),

  /**
   * The app's own update: where it stands, and the two gestures it takes.
   *
   * Checking asks the feed now rather than at the next round; installing quits
   * the app and relaunches it on the downloaded version.
   */
  /** The version of this build and the channel it follows, as the About screen says them. */
  appAbout: (): Promise<AppAbout> => ipcRenderer.invoke("app:about"),
  appUpdateState: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke("app-update:state"),
  checkAppUpdate: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke("app-update:check"),
  installAppUpdate: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke("app-update:install"),
  onAppUpdate: (listener: (state: AppUpdateState) => void): (() => void) => {
    const handler = (_e: unknown, state: AppUpdateState) => listener(state);

    ipcRenderer.on("app-update:changed", handler);

    return () => ipcRenderer.removeListener("app-update:changed", handler);
  },

  /**
   * Whether a session that waits for the reader may say so outside the window.
   *
   * The main process is the one that paints the badge and posts the
   * notification, so it is the one that keeps the preference.
   */
  notificationsEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke("notifications:enabled"),
  setNotificationsEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke("notifications:set", enabled),

  /** Whether the app opens with the session; the main process writes the login item. */
  startupState: (): Promise<StartupState> =>
    ipcRenderer.invoke("startup:state"),
  setStartupEnabled: (enabled: boolean): Promise<StartupState> =>
    ipcRenderer.invoke("startup:set", enabled),

  /** What a development build fills in for the developer; null in a packaged one. */
  devDefaults: (): Promise<DevDefaults | null> =>
    ipcRenderer.invoke("dev:defaults"),

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

  /**
   * The renderer names a kind, a project, the session a remembered tab left and
   * a folder under the project's; the command is decided over there, and every
   * name checked again.
   */
  openTerminal: (
    id: string,
    serverId: string,
    kind: TerminalKind,
    project: string | null,
    session: string | null,
    cols: number,
    rows: number,
    dir: string | null = null
  ): Promise<AgentResponse<TerminalOpened>> =>
    ipcRenderer.invoke(
      "terminal-open",
      id,
      serverId,
      kind,
      project,
      session,
      cols,
      rows,
      dir
    ),
  writeTerminal: (id: string, data: string): void =>
    ipcRenderer.send("terminal-write", id, data),
  resizeTerminal: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send("terminal-resize", id, cols, rows),
  /** `end` names the session to kill: a tab closed for good takes it with it. */
  closeTerminal: (id: string, end: TerminalEnd | null = null): void =>
    ipcRenderer.send("terminal-close", id, end),
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

  /** The address never crosses: this side names a session, and the browser opens it. */
  onTerminalLink: (callback: (link: TerminalLink) => void): (() => void) => {
    const listener = (_e: unknown, link: TerminalLink) => callback(link);
    ipcRenderer.on("terminal-link", listener);
    return () => ipcRenderer.removeListener("terminal-link", listener);
  },
  /** A notification was clicked: the session it named is the one to bring up. */
  onTerminalWanted: (callback: (id: string) => void): (() => void) => {
    const listener = (_e: unknown, payload: { id: string }) =>
      callback(payload.id);
    ipcRenderer.on("terminal-wanted", listener);
    return () => ipcRenderer.removeListener("terminal-wanted", listener);
  },
  openLogin: (id: string): Promise<boolean> =>
    ipcRenderer.invoke("login-open", id),
  /** An address clicked in a session: what it needs from the server travels with it. */
  openTerminalUrl: (id: string, url: string): Promise<boolean> =>
    ipcRenderer.invoke("terminal-open-url", id, url),
};

export type PupitreApi = typeof api;

contextBridge.exposeInMainWorld("pupitre", api);
