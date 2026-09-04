import type { z } from "zod"

import {
  CatalogResultSchema,
  HardenParamsSchema,
  HardenResultSchema,
  InstallParamsSchema,
  InstallReportSchema,
  InstallResultSchema,
  ProbeResultSchema,
  UninstallParamsSchema,
  UninstallResultSchema,
  UpgradeParamsSchema,
} from "./install"
import {
  AgentOpenParamsSchema,
  AgentOpenResultSchema,
  ProcessesListResultSchema,
  ProcessKillParamsSchema,
  SessionsCleanResultSchema,
  SessionsListResultSchema,
  ShotsCleanResultSchema,
  ShotsListResultSchema,
  ShotsReadParamsSchema,
  ShotsReadResultSchema,
  ShotsUrlResultSchema,
} from "./processes"
import {
  ProjectActionResultSchema,
  ProjectAddParamsSchema,
  ProjectAddResultSchema,
  ProjectBranchesResultSchema,
  ProjectCheckoutParamsSchema,
  ProjectCheckoutResultSchema,
  ProjectDebugResultSchema,
  ProjectDiffParamsSchema,
  ProjectDiffResultSchema,
  ProjectEnvParamsSchema,
  ProjectEnvResultSchema,
  ProjectGitStatusResultSchema,
  ProjectListResultSchema,
  ProjectLogsParamsSchema,
  ProjectLogsResultSchema,
  ProjectParamsSchema,
  ProjectRemoveResultSchema,
  ProjectSyncResultSchema,
  ProjectTargetParamsSchema,
  ProjectUrlResultSchema,
  ProjectWorkingTreeResultSchema,
} from "./projects"
import {
  DbDumpResultSchema,
  DbImportResultSchema,
  DbParamsSchema,
  DbShellResultSchema,
  DbUrlResultSchema,
  SecretsSetParamsSchema,
  SecretsStatusResultSchema,
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
} from "./system"

export const COMMANDS = {
  hello: { params: HelloParamsSchema, result: HelloResultSchema },
  ping: { params: EmptyParamsSchema, result: PingResultSchema },
  probe: { params: EmptyParamsSchema, result: ProbeResultSchema },
  catalog: { params: EmptyParamsSchema, result: CatalogResultSchema },
  install: { params: InstallParamsSchema, result: InstallResultSchema },
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
  "project.sync": {
    params: ProjectParamsSchema,
    result: ProjectSyncResultSchema,
  },
  "project.install": { params: ProjectParamsSchema, result: DoneResultSchema },
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
    params: ProjectParamsSchema,
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
  "shots.clean": { params: EmptyParamsSchema, result: ShotsCleanResultSchema },
  "secrets.status": {
    params: EmptyParamsSchema,
    result: SecretsStatusResultSchema,
  },
  "secrets.set": { params: SecretsSetParamsSchema, result: DoneResultSchema },
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
  enroll: { params: EnrollParamsSchema, result: EnrollResultSchema },
  "keys.list": { params: EmptyParamsSchema, result: KeysListResultSchema },
  "keys.sync": { params: EmptyParamsSchema, result: KeysListResultSchema },
  "agent.upgrade": {
    params: AgentUpgradeParamsSchema,
    result: AgentUpgradeResultSchema,
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

export const RESTRICTED_COMMANDS = [
  "hello",
  "ping",
  "snapshot",
  "status",
  "diag",
  "agent.upgrade",
] as const satisfies readonly CommandName[]

export type RestrictedCommandName = (typeof RESTRICTED_COMMANDS)[number]

export function isAllowedInRestrictedMode(
  cmd: string
): cmd is RestrictedCommandName {
  return (RESTRICTED_COMMANDS as readonly string[]).includes(cmd)
}
