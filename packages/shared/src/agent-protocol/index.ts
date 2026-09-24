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

/**
 * `platform.sync` is among them on purpose: a restricted agent is one whose
 * usage right the platform has not confirmed, and this is how it asks again
 * without waiting for the daemon's next turn.
 */
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

export type RestrictedCommandName = (typeof RESTRICTED_COMMANDS)[number]

export function isAllowedInRestrictedMode(
  cmd: string
): cmd is RestrictedCommandName {
  return (RESTRICTED_COMMANDS as readonly string[]).includes(cmd)
}

/**
 * A binary on a server that was never enrolled has no state to show and no
 * server to upgrade: it says who it is, answers a ping, hands out a diagnostic,
 * and takes the enrolment that gives it a server.
 */
/**
 * What a server answers while its configuration is not at the revision the
 * binary expects.
 *
 * The agent migrates itself at start-up, so this list is normally never
 * reached. It is reached when a migration refused: the files were put back as
 * they were, and a binary that reads a shape it does not understand would get
 * it wrong in ways nobody sees. Refusing is the safe answer — but a server one
 * cannot look at is a server one cannot repair, so what remains open is the
 * view of the machine, the diagnostic, the ways out (another version of the
 * agent, another attempt at the migration) and the platform.
 */
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

export type MigrationCommandName = (typeof MIGRATION_COMMANDS)[number]

export function isAllowedWhileMigrating(
  cmd: string
): cmd is MigrationCommandName {
  return (MIGRATION_COMMANDS as readonly string[]).includes(cmd)
}

export const UNENROLLED_COMMANDS = [
  "hello",
  "ping",
  "diag",
  "enroll",
] as const satisfies readonly CommandName[]

export type UnenrolledCommandName = (typeof UNENROLLED_COMMANDS)[number]

export function isAllowedWithoutEnrolment(
  cmd: string
): cmd is UnenrolledCommandName {
  return (UNENROLLED_COMMANDS as readonly string[]).includes(cmd)
}
