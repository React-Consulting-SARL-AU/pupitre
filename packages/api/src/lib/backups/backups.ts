import type { Backup, Prisma } from "@pupitre/db/cloudflare/client"
import {
  type BackupCounts,
  BackupCountsSchema,
  type BackupDeclaration,
  type BackupTrigger,
} from "@pupitre/shared/backup"
import { getPrisma, isUniqueViolation, withOrganization } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import type { ServerRow } from "../servers/server-row"
import {
  findVisibleServer,
  seesEveryServer,
  type Viewer,
} from "../servers/servers"

const NO_COUNTS: BackupCounts = {
  setup: false,
  home: false,
  databases: 0,
  projects: 0,
  paths: 0,
}

export interface BackupView {
  id: string
  server_id: string | null
  server_name: string
  created_at: Date
  trigger: BackupTrigger
  bytes: number
  counts: BackupCounts
  config_revision: number
  agent_version: string
  recipient: string
  kdf_salt: string
  location: {
    endpoint: string
    region: string
    bucket: string
    key: string
    path_style: boolean
    sha256: string
  }
}

export interface BackupDeclared {
  backup: BackupView
  created: boolean
}

export class BackupIdTakenError extends Error {}

export function toBackupView(backup: Backup): BackupView {
  const counts = BackupCountsSchema.safeParse(backup.counts)

  return {
    id: backup.backupId,
    server_id: backup.serverId,
    server_name: backup.serverName,
    created_at: backup.createdAt,
    trigger: backup.trigger,
    bytes: Number(backup.bytes),
    counts: counts.success ? counts.data : NO_COUNTS,
    config_revision: backup.configRevision,
    agent_version: backup.agentVersion,
    recipient: backup.recipient,
    kdf_salt: backup.kdfSalt,
    location: {
      endpoint: backup.endpoint,
      region: backup.region,
      bucket: backup.bucket,
      key: backup.key,
      path_style: backup.pathStyle,
      sha256: backup.manifestSha256,
    },
  }
}

function declaredBy(
  server: ServerRow,
  existing: Backup,
  created: boolean
): BackupDeclared {
  if (existing.serverId !== server.id) {
    throw new BackupIdTakenError(existing.backupId)
  }

  return { backup: toBackupView(existing), created }
}

function findDeclared(
  organizationId: string,
  backupId: string
): Promise<Backup | null> {
  return withOrganization(getPrisma(), organizationId).backup.findFirst({
    where: { backupId },
  })
}

function rowOf(
  server: ServerRow,
  input: BackupDeclaration
): Prisma.BackupUncheckedCreateInput {
  return {
    backupId: input.id,
    organizationId: server.organizationId,
    serverId: server.id,
    serverName: server.name,
    createdAt: new Date(input.created_at),
    trigger: input.trigger,
    bytes: BigInt(input.bytes),
    counts: input.counts,
    configRevision: input.config_revision,
    agentVersion: input.agent_version,
    recipient: input.recipient,
    kdfSalt: input.kdf_salt,
    endpoint: input.location.endpoint,
    region: input.location.region,
    bucket: input.location.bucket,
    key: input.location.key,
    pathStyle: input.location.path_style,
    manifestSha256: input.location.sha256,
  }
}

/** The daemon redeclares what a failure left pending: the same server gets its row back, not a refusal. */
export async function declareBackup(
  server: ServerRow,
  input: BackupDeclaration
): Promise<BackupDeclared> {
  const existing = await findDeclared(server.organizationId, input.id)

  if (existing) {
    return declaredBy(server, existing, false)
  }

  let backup: Backup

  try {
    backup = await withOrganization(
      getPrisma(),
      server.organizationId
    ).backup.create({ data: rowOf(server, input) })
  } catch (error) {
    const raced = isUniqueViolation(error)
      ? await findDeclared(server.organizationId, input.id)
      : null

    if (!raced) {
      throw error
    }

    return declaredBy(server, raced, false)
  }

  await recordEvent({
    action: "backup.created",
    actorUserId: null,
    organizationId: server.organizationId,
    targetType: "backup",
    targetId: backup.backupId,
    payload: {
      server_id: server.id,
      server_name: server.name,
      trigger: backup.trigger,
      bytes: input.bytes,
    },
  })

  return { backup: toBackupView(backup), created: true }
}

export async function removeBackup(
  server: ServerRow,
  backupId: string
): Promise<boolean> {
  const prisma = withOrganization(getPrisma(), server.organizationId)
  const { count } = await prisma.backup.deleteMany({
    where: { backupId, serverId: server.id },
  })

  if (count === 0) {
    return false
  }

  await recordEvent({
    action: "backup.deleted",
    actorUserId: null,
    organizationId: server.organizationId,
    targetType: "backup",
    targetId: backupId,
    payload: { server_id: server.id, server_name: server.name },
  })

  return true
}

function visibleWhere(viewer: Viewer): Prisma.BackupWhereInput {
  return seesEveryServer(viewer)
    ? { forgottenAt: null }
    : { forgottenAt: null, server: { assignedUserId: viewer.userId } }
}

export async function listBackups(
  organizationId: string,
  viewer: Viewer
): Promise<BackupView[]> {
  const backups = await withOrganization(
    getPrisma(),
    organizationId
  ).backup.findMany({
    where: visibleWhere(viewer),
    orderBy: { createdAt: "desc" },
  })

  return backups.map(toBackupView)
}

export async function listServerBackups(
  organizationId: string,
  serverId: string,
  viewer: Viewer
): Promise<BackupView[] | null> {
  const server = await findVisibleServer(organizationId, serverId, viewer)

  if (!server) {
    return null
  }

  const backups = await withOrganization(
    getPrisma(),
    organizationId
  ).backup.findMany({
    where: { serverId: server.id, forgottenAt: null },
    orderBy: { createdAt: "desc" },
  })

  return backups.map(toBackupView)
}

async function findVisibleBackup(
  organizationId: string,
  backupId: string,
  viewer: Viewer
): Promise<Backup | null> {
  return await withOrganization(getPrisma(), organizationId).backup.findFirst({
    where: { backupId, ...visibleWhere(viewer) },
  })
}

/** The bucket belongs to the client: forgetting only hides the reference. */
export async function forgetBackup(
  organizationId: string,
  backupId: string,
  viewer: Viewer
): Promise<boolean> {
  const backup = await findVisibleBackup(organizationId, backupId, viewer)

  if (!backup) {
    return false
  }

  await withOrganization(getPrisma(), organizationId).backup.updateMany({
    where: { id: backup.id },
    data: { forgottenAt: new Date() },
  })

  await recordEvent({
    action: "backup.forgotten",
    actorUserId: viewer.userId,
    organizationId,
    targetType: "backup",
    targetId: backupId,
    payload: { server_id: backup.serverId, server_name: backup.serverName },
  })

  return true
}

export async function recordBackupRestored(
  organizationId: string,
  backupId: string,
  serverId: string,
  viewer: Viewer
): Promise<boolean> {
  const [backup, server] = await Promise.all([
    findVisibleBackup(organizationId, backupId, viewer),
    findVisibleServer(organizationId, serverId, viewer),
  ])

  if (!(backup && server)) {
    return false
  }

  await recordEvent({
    action: "backup.restored",
    actorUserId: viewer.userId,
    organizationId,
    targetType: "backup",
    targetId: backupId,
    payload: {
      server_id: server.id,
      server_name: server.name,
      from_server_id: backup.serverId,
      from_server_name: backup.serverName,
    },
  })

  return true
}
