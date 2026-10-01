import type { BackupBeat } from "@pupitre/shared/backup"
import type { AgentStateKey, KeysBeat } from "@pupitre/shared/keys"
import { getPrisma } from "../api/prisma"
import { type LicenseState, licenseForServer } from "../billing/license"
import { resolveTargetVersion } from "../releases/releases"
import { settleAssignment } from "./assign"
import { heldDevicesForServer } from "./authorized-keys"
import { keysForServer } from "./key-approvals"
import {
  decimateSamples,
  METRICS_WINDOW_MS,
  type MetricSample,
  toSample,
  toStoredSample,
  toStoredUsage,
  toUsage,
} from "./metrics"
import type { ServerRow } from "./server-row"
import { assertSshAddress } from "./ssh-address"

/** A valid window slides with every poll; the row only follows it once an hour. */
export const LICENSE_REFRESH_MS = 3_600_000

export interface AgentState {
  license: LicenseState
  entitlement: LicenseState
  valid_until: Date
  authorized_keys: string[]
  keys: AgentStateKey[]
  target_version: string | null
  minimum_version: string | null
  hostname: string
  server_id: string
}

export interface HeartbeatInput {
  disk: number
  ram: number
  load: number
  sessions: string[]
  stack_version: string
  modules: string[]
  agent_version?: string
  ssh_user?: string
  disk_total_gb?: number
  disk_free_gb?: number
  ram_total_mb?: number
  ram_used_mb?: number
  backup?: BackupBeat
  keys?: KeysBeat
}

function horizonMoved(stored: Date | null, computed: Date): boolean {
  return (
    stored === null ||
    Math.abs(computed.getTime() - stored.getTime()) > LICENSE_REFRESH_MS
  )
}

export async function readAgentState(input: ServerRow): Promise<AgentState> {
  const prisma = getPrisma()
  const server = await settleAssignment(input)
  const license = await licenseForServer(server)
  const targetVersion = await resolveTargetVersion(server)
  const moved =
    targetVersion !== server.targetVersion ||
    horizonMoved(server.licenseValidUntil, license.valid_until)

  const [held] = await Promise.all([
    heldDevicesForServer(prisma, server.id),
    moved
      ? prisma.server.update({
          where: { id: server.id },
          data: {
            licenseValidUntil: license.valid_until,
            targetVersion,
          },
        })
      : Promise.resolve(),
  ])

  const keys = await keysForServer(prisma, server.id, held)

  return {
    license: license.state,
    entitlement: license.state,
    valid_until: license.valid_until,
    authorized_keys: held.map((device) => device.publicKey),
    keys,
    target_version: targetVersion,
    minimum_version: server.agentVersion,
    hostname: server.host ?? server.name,
    server_id: server.id,
  }
}

export async function recordHeartbeat(
  server: ServerRow,
  input: HeartbeatInput
): Promise<void> {
  assertSshAddress({ ssh_user: input.ssh_user })

  const prisma = getPrisma()
  const now = new Date()
  const sample: MetricSample = {
    at: now.toISOString(),
    disk: input.disk,
    ram: input.ram,
    load: input.load,
    sessions: input.sessions,
    stack_version: input.stack_version,
    modules: input.modules,
    disk_total_gb: input.disk_total_gb ?? null,
    disk_free_gb: input.disk_free_gb ?? null,
    ram_total_mb: input.ram_total_mb ?? null,
    ram_used_mb: input.ram_used_mb ?? null,
  }

  // One row per sample, so a heartbeat never rewrites the whole window.
  await prisma.serverMetric.create({
    data: { serverId: server.id, at: now, sample: toStoredSample(sample) },
  })

  await prisma.server.update({
    where: { id: server.id },
    data: {
      lastHeartbeatAt: now,
      agentVersion: input.agent_version ?? server.agentVersion,
      sshUser: input.ssh_user ?? server.sshUser,
      lastUsage: toStoredUsage(toUsage(sample)),
      backup: input.backup,
      keyReport: input.keys && {
        ...input.keys,
        reported_at: now.toISOString(),
      },
    },
  })

  await prisma.serverMetric.deleteMany({
    where: {
      serverId: server.id,
      at: { lt: new Date(now.getTime() - METRICS_WINDOW_MS) },
    },
  })
}

export async function metricsForServer(
  serverId: string,
  now: Date = new Date()
): Promise<MetricSample[]> {
  const rows = await getPrisma().serverMetric.findMany({
    where: {
      serverId,
      at: { gte: new Date(now.getTime() - METRICS_WINDOW_MS) },
    },
    orderBy: { at: "asc" },
    select: { sample: true },
  })

  return decimateSamples(
    rows.flatMap((row) => {
      const sample = toSample(row.sample)

      return sample ? [sample] : []
    })
  )
}
