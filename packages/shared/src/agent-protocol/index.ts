import type { z } from "zod"

import {
  BackupContentsResultSchema,
  BackupDeleteParamsSchema,
  BackupDeleteResultSchema,
  BackupInspectParamsSchema,
  BackupInspectResultSchema,
  BackupRestoreDataParamsSchema,
  BackupRestoreDataResultSchema,
  BackupRestoreSetupParamsSchema,
  BackupRestoreSetupResultSchema,
  BackupRunParamsSchema,
  BackupRunResultSchema,
  BackupStatusResultSchema,
} from "./backup"
import {
  FsListParamsSchema,
  FsListResultSchema,
  FsMkdirParamsSchema,
  FsPathResultSchema,
  FsReadParamsSchema,
  FsReadResultSchema,
  FsRemoveParamsSchema,
  FsRemoveResultSchema,
  FsRenameParamsSchema,
  FsStatParamsSchema,
  FsStatResultSchema,
  FsWriteParamsSchema,
  FsWriteResultSchema,
} from "./files"
import {
  CatalogResultSchema,
  HardenParamsSchema,
  HardenResultSchema,
  HardenSudoParamsSchema,
  HardenSudoResultSchema,
  InstallCheckParamsSchema,
  InstallCheckResultSchema,
  InstallParamsSchema,
  InstallReportSchema,
  InstallResultSchema,
  ModuleConfigParamsSchema,
  ModuleConfigResultSchema,
  ProbeResultSchema,
  UninstallParamsSchema,
  UninstallResultSchema,
  UpgradeParamsSchema,
} from "./install"
import { AgentMigrateResultSchema } from "./migrate"
import {
  AgentOpenParamsSchema,
  AgentOpenResultSchema,
  ProcessesListResultSchema,
  ProcessKillParamsSchema,
  SessionsCleanResultSchema,
  SessionsListResultSchema,
  ShotsCleanParamsSchema,
  ShotsCleanResultSchema,
  ShotsListResultSchema,
  ShotsReadParamsSchema,
  ShotsReadResultSchema,
  ShotsUrlResultSchema,
} from "./processes"
import {
  ProcessParamsSchema,
  ProjectActionResultSchema,
  ProjectAddParamsSchema,
  ProjectAddResultSchema,
  ProjectBranchesResultSchema,
  ProjectCheckoutParamsSchema,
  ProjectCheckoutResultSchema,
  ProjectDebugResultSchema,
  ProjectDetectParamsSchema,
  ProjectDetectResultSchema,
  ProjectDiffParamsSchema,
  ProjectDiffResultSchema,
  ProjectEnvParamsSchema,
  ProjectEnvResultSchema,
  ProjectGitStatusResultSchema,
  ProjectInstallParamsSchema,
  ProjectInstallResultSchema,
  ProjectListResultSchema,
  ProjectLogsParamsSchema,
  ProjectLogsResultSchema,
  ProjectParamsSchema,
  ProjectPullResultSchema,
  ProjectRemoveResultSchema,
  ProjectSyncResultSchema,
  ProjectTargetParamsSchema,
  ProjectUpdateParamsSchema,
  ProjectUpdateResultSchema,
  ProjectUrlResultSchema,
  ProjectWorkingTreeResultSchema,
} from "./projects"
import {
  DbDumpResultSchema,
  DbImportResultSchema,
  DbParamsSchema,
  DbShellResultSchema,
  DbUrlResultSchema,
  SecretsSyncParamsSchema,
  SecretsSyncResultSchema,
  ServiceSecretParamsSchema,
  ServiceSecretResultSchema,
  TunnelStatusResultSchema,
} from "./secrets"
import {
  EmptyParamsSchema,
  HelloParamsSchema,
  HelloResultSchema,
  PingResultSchema,
} from "./session"
import {
  CompletionsParamsSchema,
  CompletionsResultSchema,
  ServiceActionParamsSchema,
  ServiceLogsParamsSchema,
  ServiceLogsResultSchema,
  ServiceStatusParamsSchema,
  ServiceStatusResultSchema,
  SnapshotResultSchema,
  StatusResultSchema,
} from "./state"
import {
  AgentUpgradeParamsSchema,
  AgentUpgradeResultSchema,
  DiagResultSchema,
  DoctorResultSchema,
  DoneResultSchema,
  EnrollParamsSchema,
  EnrollResultSchema,
  KeysListResultSchema,
  KeysTrustParamsSchema,
  PlatformSyncResultSchema,
} from "./system"

export const COMMANDS = {
  hello: { params: HelloParamsSchema, result: HelloResultSchema },
  ping: { params: EmptyParamsSchema, result: PingResultSchema },
  probe: { params: EmptyParamsSchema, result: ProbeResultSchema },
  catalog: { params: EmptyParamsSchema, result: CatalogResultSchema },
  install: { params: InstallParamsSchema, result: InstallResultSchema },
  "install.check": {
    params: InstallCheckParamsSchema,
    result: InstallCheckResultSchema,
  },
  "module.config": {
    params: ModuleConfigParamsSchema,
    result: ModuleConfigResultSchema,
  },
  uninstall: { params: UninstallParamsSchema, result: UninstallResultSchema },
  harden: { params: HardenParamsSchema, result: HardenResultSchema },
  "harden.sudo": {
    params: HardenSudoParamsSchema,
    result: HardenSudoResultSchema,
  },
  upgrade: { params: UpgradeParamsSchema, result: InstallResultSchema },
  report: { params: EmptyParamsSchema, result: InstallReportSchema },
  snapshot: { params: EmptyParamsSchema, result: SnapshotResultSchema },
  status: { params: EmptyParamsSchema, result: StatusResultSchema },
  "service.status": {
    params: ServiceStatusParamsSchema,
    result: ServiceStatusResultSchema,
  },
  "service.secret": {
    params: ServiceSecretParamsSchema,
    result: ServiceSecretResultSchema,
  },
  "service.start": {
    params: ServiceActionParamsSchema,
    result: ServiceStatusResultSchema,
  },
  "service.stop": {
    params: ServiceActionParamsSchema,
    result: ServiceStatusResultSchema,
  },
  "service.restart": {
    params: ServiceActionParamsSchema,
    result: ServiceStatusResultSchema,
  },
  "service.logs": {
    params: ServiceLogsParamsSchema,
    result: ServiceLogsResultSchema,
  },
  completions: {
    params: CompletionsParamsSchema,
    result: CompletionsResultSchema,
  },
  "project.list": {
    params: EmptyParamsSchema,
    result: ProjectListResultSchema,
  },
  "project.add": {
    params: ProjectAddParamsSchema,
    result: ProjectAddResultSchema,
  },
  "project.detect": {
    params: ProjectDetectParamsSchema,
    result: ProjectDetectResultSchema,
  },
  "project.update": {
    params: ProjectUpdateParamsSchema,
    result: ProjectUpdateResultSchema,
  },
  "project.remove": {
    params: ProjectParamsSchema,
    result: ProjectRemoveResultSchema,
  },
  "project.up": {
    params: ProjectTargetParamsSchema,
    result: ProjectActionResultSchema,
  },
  "project.down": {
    params: ProjectTargetParamsSchema,
    result: ProjectActionResultSchema,
  },
  "project.restart": {
    params: ProjectTargetParamsSchema,
    result: ProjectActionResultSchema,
  },
  "project.logs": {
    params: ProjectLogsParamsSchema,
    result: ProjectLogsResultSchema,
  },
  "project.pull": {
    params: ProjectParamsSchema,
    result: ProjectPullResultSchema,
  },
  "project.sync": {
    params: ProjectParamsSchema,
    result: ProjectSyncResultSchema,
  },
  "project.install": {
    params: ProjectInstallParamsSchema,
    result: ProjectInstallResultSchema,
  },
  "project.env": {
    params: ProjectEnvParamsSchema,
    result: ProjectEnvResultSchema,
  },
  "project.branches": {
    params: ProjectParamsSchema,
    result: ProjectBranchesResultSchema,
  },
  "project.checkout": {
    params: ProjectCheckoutParamsSchema,
    result: ProjectCheckoutResultSchema,
  },
  "project.git_status": {
    params: ProjectParamsSchema,
    result: ProjectGitStatusResultSchema,
  },
  "project.working_tree": {
    params: ProjectParamsSchema,
    result: ProjectWorkingTreeResultSchema,
  },
  "project.diff": {
    params: ProjectDiffParamsSchema,
    result: ProjectDiffResultSchema,
  },
  "project.url": {
    params: ProjectParamsSchema,
    result: ProjectUrlResultSchema,
  },
  "project.debug": {
    params: ProcessParamsSchema,
    result: ProjectDebugResultSchema,
  },
  "agent.open": {
    params: AgentOpenParamsSchema,
    result: AgentOpenResultSchema,
  },
  "sessions.list": {
    params: EmptyParamsSchema,
    result: SessionsListResultSchema,
  },
  "sessions.clean": {
    params: EmptyParamsSchema,
    result: SessionsCleanResultSchema,
  },
  "processes.list": {
    params: EmptyParamsSchema,
    result: ProcessesListResultSchema,
  },
  "process.kill": { params: ProcessKillParamsSchema, result: DoneResultSchema },
  "shots.list": { params: EmptyParamsSchema, result: ShotsListResultSchema },
  "shots.url": { params: EmptyParamsSchema, result: ShotsUrlResultSchema },
  "shots.read": {
    params: ShotsReadParamsSchema,
    result: ShotsReadResultSchema,
  },
  "shots.clean": {
    params: ShotsCleanParamsSchema,
    result: ShotsCleanResultSchema,
  },
  "fs.list": { params: FsListParamsSchema, result: FsListResultSchema },
  "fs.stat": { params: FsStatParamsSchema, result: FsStatResultSchema },
  "fs.read": { params: FsReadParamsSchema, result: FsReadResultSchema },
  "fs.write": { params: FsWriteParamsSchema, result: FsWriteResultSchema },
  "fs.mkdir": { params: FsMkdirParamsSchema, result: FsPathResultSchema },
  "fs.rename": { params: FsRenameParamsSchema, result: FsPathResultSchema },
  "fs.remove": { params: FsRemoveParamsSchema, result: FsRemoveResultSchema },
  "secrets.sync": {
    params: SecretsSyncParamsSchema,
    result: SecretsSyncResultSchema,
  },
  "db.dump": { params: DbParamsSchema, result: DbDumpResultSchema },
  "db.import": { params: DbParamsSchema, result: DbImportResultSchema },
  "db.shell": { params: DbParamsSchema, result: DbShellResultSchema },
  "db.url": { params: DbParamsSchema, result: DbUrlResultSchema },
  "tunnel.status": {
    params: EmptyParamsSchema,
    result: TunnelStatusResultSchema,
  },
  "tunnel.sync": {
    params: EmptyParamsSchema,
    result: TunnelStatusResultSchema,
  },
  "tunnel.restart": {
    params: EmptyParamsSchema,
    result: TunnelStatusResultSchema,
  },
  "backup.status": {
    params: EmptyParamsSchema,
    result: BackupStatusResultSchema,
  },
  "backup.contents": {
    params: EmptyParamsSchema,
    result: BackupContentsResultSchema,
  },
  "backup.run": {
    params: BackupRunParamsSchema,
    result: BackupRunResultSchema,
  },
  "backup.delete": {
    params: BackupDeleteParamsSchema,
    result: BackupDeleteResultSchema,
  },
  "backup.inspect": {
    params: BackupInspectParamsSchema,
    result: BackupInspectResultSchema,
  },
  "backup.restore.setup": {
    params: BackupRestoreSetupParamsSchema,
    result: BackupRestoreSetupResultSchema,
  },
  "backup.restore.data": {
    params: BackupRestoreDataParamsSchema,
    result: BackupRestoreDataResultSchema,
  },
  "backup.restore.abort": {
    params: EmptyParamsSchema,
    result: DoneResultSchema,
  },
  enroll: { params: EnrollParamsSchema, result: EnrollResultSchema },
  "keys.list": { params: EmptyParamsSchema, result: KeysListResultSchema },
  "keys.sync": { params: EmptyParamsSchema, result: KeysListResultSchema },
  "keys.trust": { params: KeysTrustParamsSchema, result: KeysListResultSchema },
  "platform.sync": {
    params: EmptyParamsSchema,
    result: PlatformSyncResultSchema,
  },
  "agent.upgrade": {
    params: AgentUpgradeParamsSchema,
    result: AgentUpgradeResultSchema,
  },
  "agent.migrate": {
    params: EmptyParamsSchema,
    result: AgentMigrateResultSchema,
  },
  reboot: { params: EmptyParamsSchema, result: DoneResultSchema },
  doctor: { params: EmptyParamsSchema, result: DoctorResultSchema },
  diag: { params: EmptyParamsSchema, result: DiagResultSchema },
} as const

export type CommandName = keyof typeof COMMANDS

export const COMMAND_NAMES = Object.keys(COMMANDS) as readonly CommandName[]

export type CommandParams<C extends CommandName> = z.infer<
  (typeof COMMANDS)[C]["params"]
>

export type CommandResult<C extends CommandName> = z.infer<
  (typeof COMMANDS)[C]["result"]
>

export function isCommandName(value: string): value is CommandName {
  return Object.hasOwn(COMMANDS, value)
}

// `platform.sync` is how a restricted agent asks the platform again without waiting for the daemon.
export const RESTRICTED_COMMANDS = [
  "hello",
  "ping",
  "snapshot",
  "status",
  "diag",
  "agent.upgrade",
  "agent.migrate",
  "enroll",
  "platform.sync",
] as const satisfies readonly CommandName[]

// Reached only after a refused migration: a server one cannot look at is a server one cannot repair.
export const MIGRATION_COMMANDS = [
  "hello",
  "ping",
  "snapshot",
  "status",
  "report",
  "diag",
  "doctor",
  "agent.upgrade",
  "agent.migrate",
  "enroll",
  "platform.sync",
] as const satisfies readonly CommandName[]

export const UNENROLLED_COMMANDS = [
  "hello",
  "ping",
  "diag",
  "enroll",
] as const satisfies readonly CommandName[]

// Reachable by anything running as `dev`: a command stays privileged until listed here.
export const LIMITED_COMMANDS = [
  "hello",
  "ping",
  "probe",
  "catalog",
  "module.config",
  "report",
  "snapshot",
  "status",
  "service.status",
  "service.start",
  "service.stop",
  "service.restart",
  "service.logs",
  "completions",
  "project.list",
  "project.add",
  "project.detect",
  "project.update",
  "project.remove",
  "project.up",
  "project.down",
  "project.restart",
  "project.logs",
  "project.pull",
  "project.sync",
  "project.install",
  "project.env",
  "project.branches",
  "project.checkout",
  "project.git_status",
  "project.working_tree",
  "project.diff",
  "project.url",
  "project.debug",
  "agent.open",
  "sessions.list",
  "sessions.clean",
  "processes.list",
  "process.kill",
  "shots.list",
  "shots.url",
  "shots.read",
  "shots.clean",
  "fs.list",
  "fs.stat",
  "fs.read",
  "fs.write",
  "fs.mkdir",
  "fs.rename",
  "fs.remove",
  "secrets.sync",
  "db.shell",
  "db.url",
  "tunnel.status",
  "tunnel.sync",
  "tunnel.restart",
  "backup.status",
  "backup.contents",
  "keys.list",
  "keys.sync",
  "platform.sync",
  "agent.upgrade",
  "agent.migrate",
  "doctor",
  "diag",
] as const satisfies readonly CommandName[]

// A downgrade would run a signed but known-faulty agent as root, of the caller's choosing.
export function requiresPrivilege(cmd: string, params?: unknown): boolean {
  if (!(LIMITED_COMMANDS as readonly string[]).includes(cmd)) {
    return true
  }

  return (
    cmd === "agent.upgrade" &&
    typeof params === "object" &&
    params !== null &&
    (params as { allow_downgrade?: unknown }).allow_downgrade === true
  )
}
