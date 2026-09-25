import type { CommandName } from "@pupitre/shared/agent-protocol";
import type {
  BackupRestoreDataResult,
  BackupRestoreSetupResult,
} from "@pupitre/shared/agent-protocol/backup";
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
import type { PendingKeyApproval } from "@pupitre/shared/keys";
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
import type {
  BackupConnectionInput,
  BackupConnectionView,
  OrganizationIdentity,
  PlatformBackup,
  RestoreSetupOptions,
  RestoreUpdate,
} from "@shared/backups";
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
import type { HelpLink } from "@shared/help";
import type {
  AgentDelivery,
  AgentSendPhase,
  InstallUpdate,
} from "@shared/install";
import type { KeyApprovalReceipt } from "@shared/key-approvals";
import type { ProjectAction } from "@shared/projects";
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
import type { SshShareState } from "@shared/ssh-names";
import type { StartupState } from "@shared/startup";
import type { SudoOutcome, SudoPasswordState } from "@shared/sudo";
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

// No free-form command crosses this bridge: the renderer names things, the main process decides.

function subscribe<T>(
  channel: string
): (listener: (payload: T) => void) => () => void {
  return (listener) => {
    const handler = (_event: unknown, payload: T) => listener(payload);

    ipcRenderer.on(channel, handler);

    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

/** The token routes events to their caller: two installs side by side would otherwise draw each other's. */
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

/** An invoke answer can overtake the events sent before it, so an answered stream waits for `end`. */
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

/** Two fields, not a promise with a method: the bridge copies a promise and drops anything hung on it. */
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
  /** The bearer token never crosses: the main process reads it from the keychain at call time. */
  account: (): Promise<AccountState> => ipcRenderer.invoke("account:state"),
  /** The agent only gets the new locale on its next hello. */
  setLocale: (locale: string): void => ipcRenderer.send("locale:set", locale),
  /** Per device: the web console keeps its own active organization. */
  switchOrganization: (organizationId: string): Promise<AccountState> =>
    ipcRenderer.invoke("account:organization", organizationId),
  refreshAccount: (): Promise<AccountState> =>
    ipcRenderer.invoke("account:refresh"),
  signOut: (): Promise<AccountState> => ipcRenderer.invoke("account:sign-out"),
  accountDevices: (): Promise<AgentResponse<AccountDevice[]>> =>
    ipcRenderer.invoke("account:devices"),
  revokeDevice: (deviceId: string): Promise<AgentResponse<null>> =>
    ipcRenderer.invoke("account:device-revoke", deviceId),
  keyApprovals: (): Promise<AgentResponse<PendingKeyApproval[]>> =>
    ipcRenderer.invoke("key-approvals:list"),
  approveKey: (
    serverId: string,
    deviceId: string
  ): Promise<AgentResponse<KeyApprovalReceipt>> =>
    ipcRenderer.invoke("key-approvals:approve", serverId, deviceId),

  signIn: (
    onProgress: (progress: SignInProgress) => void
  ): Promise<AccountResponse<AccountState>> =>
    streamed<AccountResponse<AccountState>, { progress: SignInProgress }>(
      "account:sign-in",
      "account:sign-in-progress",
      (payload) => onProgress(payload.progress)
    ),
  /** The sign-in under way then settles with a `cancelled` refusal. */
  cancelSignIn: (): void => ipcRenderer.send("account:sign-in-cancel"),

  /** The main process validates the command and its params before anything reaches the channel. */
  agentCall: (
    serverId: string,
    cmd: CommandName,
    params?: unknown
  ): Promise<AgentResponse<unknown>> =>
    ipcRenderer.invoke("agent:call", serverId, cmd, params),

  /** Timer reads ride the beat channel, so a gesture never waits behind the dashboard's next read. */
  agentPoll: (
    serverId: string,
    cmd: CommandName,
    params?: unknown
  ): Promise<AgentResponse<unknown>> =>
    ipcRenderer.invoke("agent:call", serverId, cmd, params, true),

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

  /** Nothing is written on the machine: the probe script travels on standard input. */
  inspect: (serverId: string): Promise<AgentResponse<ProbeResult>> =>
    ipcRenderer.invoke("inspection:probe", serverId),

  catalog: (serverId: string): Promise<AgentResponse<CatalogResult>> =>
    ipcRenderer.invoke("catalog:list", serverId),

  /** Held in main until the install writes it on the secret line; only marks come back. */
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

  /** Reveals once: a second call answers `null`. */
  revealInstallSecret: (
    serverId: string,
    moduleId: string,
    key: string
  ): Promise<{ value: string | null; marks: SecretMarks }> =>
    ipcRenderer.invoke("catalog:secret-reveal", serverId, moduleId, key),
  forgetInstallSecrets: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("catalog:secret-forget", serverId),

  /** Secrets come from the main process's vault at call time; none ever comes back over this bridge. */
  startInstall: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    onUpdate: (update: InstallUpdate) => void,
    /** Modules installed without configuring: their questions wait. */
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

  /** Sent before the catalogue: a bare server cannot answer `catalog` until `pupitred` is on it. */
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

  /** The account is not a parameter: the protocol fixes it at `dev`. */
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

  sudoPasswordState: (serverId: string): Promise<SudoPasswordState> =>
    ipcRenderer.invoke("sudo:state", serverId),
  revealSudoPassword: (serverId: string): Promise<string | null> =>
    ipcRenderer.invoke("sudo:reveal", serverId),
  /** The main process writes the clipboard: the password never reaches the renderer. */
  copySudoPassword: (serverId: string): Promise<boolean> =>
    ipcRenderer.invoke("sudo:copy", serverId),
  /** Kept only once sudo accepted it on the server; the password never comes back. */
  enterSudoPassword: (
    serverId: string,
    password: string
  ): Promise<SudoOutcome> =>
    ipcRenderer.invoke("sudo:enter", serverId, password),

  listProjects: (serverId: string): Promise<AgentResponse<ProjectListResult>> =>
    ipcRenderer.invoke("project:list", serverId),
  connectionsState: (): Promise<ConnectionsState> =>
    ipcRenderer.invoke("connections:state"),
  /** The token goes straight to the keychain; one opening several accounts comes back as a choice. */
  connectAccount: (
    kind: ConnectionKind,
    token: string,
    accountId?: string
  ): Promise<AgentResponse<ConnectionOutcome>> =>
    ipcRenderer.invoke("connections:connect", kind, token, accountId),
  forgetAccount: (kind: ConnectionKind): Promise<ConnectionsState> =>
    ipcRenderer.invoke("connections:forget", kind),
  verifyAccount: (
    kind: ConnectionKind
  ): Promise<AgentResponse<ConnectionCheck>> =>
    ipcRenderer.invoke("connections:verify", kind),
  connectionZones: (): Promise<AgentResponse<CloudflareZone[]>> =>
    ipcRenderer.invoke("connections:zones"),
  /** The secret access key stays in the keychain; the passphrase is derived in main and kept nowhere. */
  backupConnection: (): Promise<BackupConnectionView | null> =>
    ipcRenderer.invoke("backup:connection"),
  /** The identity of the organization's latest backup, which a second computer adopts. */
  backupIdentity: (): Promise<AgentResponse<OrganizationIdentity | null>> =>
    ipcRenderer.invoke("backup:identity"),
  /** A test write, nothing kept; a secret key left out is taken from the keychain. */
  probeBackup: (input: BackupConnectionInput): Promise<AgentResponse<null>> =>
    ipcRenderer.invoke("backup:probe", input),
  connectBackup: (
    input: BackupConnectionInput
  ): Promise<AgentResponse<BackupConnectionView>> =>
    ipcRenderer.invoke("backup:connect", input),
  /** `null` lists the whole organization's backups. */
  listBackups: (
    serverId: string | null
  ): Promise<AgentResponse<PlatformBackup[]>> =>
    ipcRenderer.invoke("backup:list", serverId),
  restoreBackupSetup: (
    serverId: string,
    backupId: string,
    passphrase: string,
    options: RestoreSetupOptions,
    onUpdate: (update: RestoreUpdate) => void
  ): Promise<AgentResponse<BackupRestoreSetupResult>> =>
    streamedToEnd<
      AgentResponse<BackupRestoreSetupResult>,
      { update: RestoreUpdate }
    >(
      "backup:restore-setup",
      "backup:restore-update",
      (payload) => onUpdate(payload.update),
      serverId,
      backupId,
      passphrase,
      options
    ),
  /** The passphrase is needed only when this run of the app never held the key. */
  restoreBackupData: (
    serverId: string,
    backupId: string,
    parts: readonly string[],
    passphrase: string | null,
    onEvent: (event: Event) => void
  ): Promise<AgentResponse<BackupRestoreDataResult>> =>
    streamedToEnd<
      AgentResponse<BackupRestoreDataResult>,
      { update: RestoreUpdate }
    >(
      "backup:restore-data",
      "backup:restore-update",
      (payload) => {
        if (payload.update.kind === "event") {
          onEvent(payload.update.event);
        }
      },
      serverId,
      backupId,
      parts,
      passphrase
    ),
  abortRestore: (serverId: string): Promise<AgentResponse<{ done: true }>> =>
    ipcRenderer.invoke("backup:restore-abort", serverId),
  /** Cached a few minutes in the main process; `refresh` bypasses the cache. */
  githubRepos: (refresh = false): Promise<AgentResponse<GithubRepo[]>> =>
    ipcRenderer.invoke("github:repos", refresh),
  /** A dry run on the server: no secret sent, nothing touched, only what it would refuse field by field. */
  checkInstall: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    defer: readonly string[] = []
  ): Promise<AgentResponse<InstallCheckResult>> =>
    ipcRenderer.invoke("install:check", serverId, modules, config, defer),
  onChannel: subscribe<{ serverId: string; state: "open" | "lost" }>(
    "agent:channel"
  ),
  /** Without it the console shows an empty server until the daemon's next beat, five minutes away. */
  syncPlatform: (
    serverId: string
  ): Promise<AgentResponse<PlatformSyncResult>> =>
    ipcRenderer.invoke("platform:sync", serverId),
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

  /** Fetches from the remote: asked on opening a project and on demand, never from a refresh loop. */
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
  /** Keys only, never a value; `force` rewrites the file, `process` names the folder it lives in. */
  projectEnv: (
    serverId: string,
    name: string,
    force = false,
    process?: string
  ): Promise<AgentResponse<ProjectEnvResult>> =>
    ipcRenderer.invoke("project:env", serverId, name, force, process ?? null),

  /** `name` may be "all", the agent's own word for every project. */
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

  openInEditor: (
    serverId: string,
    editor: RemoteEditorId,
    path: string
  ): Promise<void> =>
    ipcRenderer.invoke("project:editor", serverId, editor, path),

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

  /** `cancel` cuts the agent short rather than leaving it writing for nobody. */
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

  /** Names the credentials only: their values stay in the main process. */
  serviceDetail: (
    serverId: string,
    moduleId: string
  ): Promise<AgentResponse<ServiceDetail>> =>
    ipcRenderer.invoke("service:detail", serverId, moduleId),

  /** Files the connection string with the credentials and returns its label, never the value. */
  databaseUrl: (
    serverId: string,
    moduleId: string,
    name?: string
  ): Promise<AgentResponse<{ label: string }>> =>
    ipcRenderer.invoke("service:db-url", serverId, moduleId, name ?? null),

  revealCredential: (
    serverId: string,
    moduleId: string,
    label: string
  ): Promise<string | null> =>
    ipcRenderer.invoke("service:credential-reveal", serverId, moduleId, label),

  /** The main process writes the clipboard: the value never reaches the renderer. */
  copyCredential: (
    serverId: string,
    moduleId: string,
    label: string
  ): Promise<boolean> =>
    ipcRenderer.invoke("service:credential-copy", serverId, moduleId, label),

  forgetCredentials: (serverId: string, moduleId?: string): Promise<void> =>
    ipcRenderer.invoke("service:forget", serverId, moduleId ?? null),

  openPortForward: (
    serverId: string,
    remotePort: number,
    label: string
  ): Promise<AgentResponse<PortForward>> =>
    ipcRenderer.invoke("service:forward-open", serverId, remotePort, label),
  closePortForward: (id: string): Promise<PortForward[]> =>
    ipcRenderer.invoke("service:forward-close", id),
  portForwards: (serverId?: string): Promise<PortForward[]> =>
    ipcRenderer.invoke("service:forwards", serverId ?? null),
  /** Pushed whole on every change: a forward can die on its own. */
  onPortForwards: subscribe<PortForward[]>("service:forwards-changed"),

  /** The command stays in main under the returned tab; `openTerminal` on that tab runs it. */
  openDatabaseShell: (
    serverId: string,
    moduleId: string,
    name?: string
  ): Promise<AgentResponse<DatabaseShell>> =>
    ipcRenderer.invoke("service:db-shell", serverId, moduleId, name ?? null),

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

  /** A local path is accepted only once the user pointed at it, in a dialog or by dropping a file. */
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
  onTransfers: subscribe<TransferList>("transfer:changed"),
  /** The sandboxed page sees a `File` with no path, so the preload reads it for the main process. */
  pathOfDroppedFile: (file: File): Promise<string | null> =>
    ipcRenderer.invoke("transfer:dropped", webUtils.getPathForFile(file)),
  pickUploadPaths: (): Promise<string[]> =>
    ipcRenderer.invoke("transfer:pick-upload"),
  pickSavePath: (name: string): Promise<string | null> =>
    ipcRenderer.invoke("transfer:pick-save", name),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("transfer:pick-folder"),
  /** Only the path `pickSavePath` just returned is accepted. */
  saveShot: (
    path: string,
    bytes: Uint8Array
  ): Promise<AgentResponse<{ path: string }>> =>
    ipcRenderer.invoke("shots:save", path, bytes),

  installReport: (serverId: string): Promise<AgentResponse<InstallReport>> =>
    ipcRenderer.invoke("install:report", serverId),

  /** An update's version and signature are never parameters: only the main process reads the embedded release. */
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

  /** Retry after a refused migration (`upgradeAgent` already migrates); null for an agent before the ledger. */
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

  /** The fresh enrolment token goes from the platform to the secret line and never crosses this bridge. */
  reenrollServer: (serverId: string): Promise<AgentResponse<EnrollResult>> =>
    ipcRenderer.invoke("reenroll:start", serverId),

  agentSession: (serverId: string): Promise<HelloResult | null> =>
    ipcRenderer.invoke("agent:session", serverId),
  agentClose: (serverId: string): Promise<void> =>
    ipcRenderer.invoke("agent:close", serverId),

  servers: (): Promise<ServersConfig> => ipcRenderer.invoke("servers"),

  fleet: (): Promise<AgentResponse<FleetView>> =>
    ipcRenderer.invoke("fleet:list"),
  openGrantedServer: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("fleet:open", id),
  restoreGrantedServers: (): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("fleet:restore"),

  sshHosts: (): Promise<string[]> => ipcRenderer.invoke("ssh-hosts"),

  /** The `Include` line in the system's SSH config changes on request only, never on its own. */
  sshShareState: (): Promise<SshShareState> =>
    ipcRenderer.invoke("ssh-share:state"),
  setSshShare: (shared: boolean): Promise<SshShareState> =>
    ipcRenderer.invoke("ssh-share:set", shared),

  /** Runs before a server is declared, so it takes the form, not an id; a password goes with `addServer`. */
  reachServer: (target: ServerKnock): Promise<ServerReach> =>
    ipcRenderer.invoke("server-reach", target),

  /** No private key crosses the bridge: a key to import is picked in a system dialog by the main process. */
  addServer: (draft: ServerDraft): Promise<AgentResponse<ServerAdded>> =>
    ipcRenderer.invoke("server-add", draft),
  renameServer: (id: string, name: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-rename", id, name),
  activateServer: (id: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-activate", id),
  /** The pinned host key goes with the old address, and the answer says so. */
  updateServer: (
    id: string,
    changes: ServerChanges
  ): Promise<AgentResponse<ServerUpdated>> =>
    ipcRenderer.invoke("server-update", id, changes),
  removeServer: (id: string): Promise<ServersConfig> =>
    ipcRenderer.invoke("server-remove", id),

  /** Unlike `removeServer`, also erases the server from the platform. */
  forgetServer: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("server-forget", id),
  serverPublicKey: (id: string): Promise<string | null> =>
    ipcRenderer.invoke("server-public-key", id),
  pickKeyFile: (): Promise<string | null> =>
    ipcRenderer.invoke("key-file-pick"),

  /** The password is never held: the main process hands it to one `ssh` and forgets it. */
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

  /** Silent in a packaged build: the trace is off there. */
  onTrace: subscribe<TraceEntry>("trace"),

  hostKey: (id: string): Promise<AgentResponse<HostKeyDecision>> =>
    ipcRenderer.invoke("server-host-key", id),
  trustReinstalled: (id: string): Promise<AgentResponse<ServersConfig>> =>
    ipcRenderer.invoke("server-trust-reinstalled", id),

  openUrl: (url: string): Promise<void> => ipcRenderer.invoke("open-url", url),

  /** The main process builds the address: a support mail carries the app and system versions. */
  openHelp: (link: HelpLink, language: string): Promise<void> =>
    ipcRenderer.invoke("help:open", link, language),

  /** Performed as the click would be, with its own confirmation where one exists. */
  onMenuCommand: subscribe<MenuCommand>("menu:command"),

  onDeepLink: subscribe<DeepLink>("deep-link"),
  /** The link the app was opened with arrived before this page could listen; handed over once. */
  pendingDeepLink: (): Promise<DeepLink | null> =>
    ipcRenderer.invoke("deep-link:pending"),

  appAbout: (): Promise<AppAbout> => ipcRenderer.invoke("app:about"),
  appUpdateState: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke("app-update:state"),
  checkAppUpdate: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke("app-update:check"),
  installAppUpdate: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke("app-update:install"),
  onAppUpdate: subscribe<AppUpdateState>("app-update:changed"),

  notificationsEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke("notifications:enabled"),
  setNotificationsEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke("notifications:set", enabled),

  startupState: (): Promise<StartupState> =>
    ipcRenderer.invoke("startup:state"),
  setStartupEnabled: (enabled: boolean): Promise<StartupState> =>
    ipcRenderer.invoke("startup:set", enabled),

  /** Null in a packaged build. */
  devDefaults: (): Promise<DevDefaults | null> =>
    ipcRenderer.invoke("dev:defaults"),

  /** Without it the native frame follows the system theme and a resize shows the wrong colour. */
  setAppearance: (appearance: Appearance): void =>
    ipcRenderer.send("appearance:set", appearance),

  completions: (
    serverId: string,
    path?: string
  ): Promise<AgentResponse<CompletionsResult>> =>
    ipcRenderer.invoke("completions", serverId, path ?? ""),

  terminalDiagnostics: (): Promise<{
    sessions: number;
    keystrokesReceived: number;
  }> => ipcRenderer.invoke("terminal-diagnostics"),

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
  /** OSC 52 from a session: the page itself may not write the clipboard unprompted. */
  copyFromTerminal: (text: string): void =>
    ipcRenderer.send("terminal-copy", text),
  resizeTerminal: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send("terminal-resize", id, cols, rows),
  /** `end` names the session to kill: a tab closed for good takes it with it. */
  closeTerminal: (id: string, end: TerminalEnd | null = null): void =>
    ipcRenderer.send("terminal-close", id, end),
  onTerminalData: subscribe<{ id: string; data: string }>("terminal-data"),
  onTerminalStates: subscribe<Record<string, AgentState>>("terminal-states"),
  onTerminalExit: subscribe<{ id: string; code: number }>("terminal-exit"),

  /** The login address never crosses: the renderer names a session and `openLogin` opens it. */
  onTerminalLink: subscribe<TerminalLink>("terminal-link"),
  /** Fired when a notification naming that session is clicked. */
  onTerminalWanted: (callback: (id: string) => void): (() => void) =>
    subscribe<{ id: string }>("terminal-wanted")((payload) =>
      callback(payload.id)
    ),
  openLogin: (id: string): Promise<boolean> =>
    ipcRenderer.invoke("login-open", id),
  openTerminalUrl: (id: string, url: string): Promise<boolean> =>
    ipcRenderer.invoke("terminal-open-url", id, url),
};

export type PupitreApi = typeof api;

contextBridge.exposeInMainWorld("pupitre", api);
