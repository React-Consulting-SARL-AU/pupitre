import type { Server } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import {
  type EntitlementState,
  entitlementForServer,
} from "../billing/entitlement"
import { resolveTargetVersion } from "../releases/releases"
import { settleAssignment } from "./assign"
import { authorizedKeysForServer } from "./authorized-keys"
import {
  appendSample,
  type MetricSample,
  readSamples,
  toStoredMetrics,
  toStoredUsage,
  toUsage,
} from "./metrics"
import type { ServerRow } from "./server-row"

export type AgentEntitlement = EntitlementState

/** A valid window slides with every poll; the row only follows it once an hour. */
export const ENTITLEMENT_REFRESH_MS = 3_600_000

export interface AgentState {
  entitlement: AgentEntitlement
  valid_until: Date
  authorized_keys: string[]
  target_version: string | null
  minimum_version: string | null
  hostname: string
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
}

function horizonMoved(stored: Date | null, computed: Date): boolean {
  return (
    stored === null ||
    Math.abs(computed.getTime() - stored.getTime()) > ENTITLEMENT_REFRESH_MS
  )
}

export async function readAgentState(input: ServerRow): Promise<AgentState> {
  const prisma = getPrisma()
  const server = await settleAssignment(input)
  const entitlement = await entitlementForServer(server)
  const targetVersion = await resolveTargetVersion(server)
  const moved =
    targetVersion !== server.targetVersion ||
    horizonMoved(server.entitlementValidUntil, entitlement.valid_until)
  const [authorizedKeys] = await Promise.all([
    authorizedKeysForServer(prisma, server.id),
    moved
      ? prisma.server.update({
          where: { id: server.id },
          data: {
            entitlementValidUntil: entitlement.valid_until,
            targetVersion,
          },
        })
      : Promise.resolve(),
  ])

  return {
    entitlement: entitlement.state,
    valid_until: entitlement.valid_until,
    authorized_keys: authorizedKeys,
    target_version: targetVersion,
    minimum_version: server.agentVersion,
    hostname: server.host ?? server.name,
  }
}

export async function recordHeartbeat(
  server: ServerRow,
  input: HeartbeatInput
): Promise<void> {
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
  const window = await prisma.server.findUnique({
    where: { id: server.id },
    select: { metrics: true },
  })

  await prisma.server.update({
    where: { id: server.id },
    data: {
      lastHeartbeatAt: now,
      agentVersion: input.agent_version ?? server.agentVersion,
      sshUser: input.ssh_user ?? server.sshUser,
      metrics: toStoredMetrics(appendSample(window?.metrics, sample, now)),
      lastUsage: toStoredUsage(toUsage(sample)),
    },
  })
}

export function metricsOf(server: Pick<Server, "metrics">): MetricSample[] {
  return readSamples(server.metrics)
}
