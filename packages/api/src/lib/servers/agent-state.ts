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
} from "./metrics"

export type AgentEntitlement = EntitlementState

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
  disk_total_gb?: number
  disk_free_gb?: number
  ram_total_mb?: number
  ram_used_mb?: number
}

export async function readAgentState(input: Server): Promise<AgentState> {
  const prisma = getPrisma()
  const server = await settleAssignment(input)
  const entitlement = await entitlementForServer(server)
  const targetVersion = await resolveTargetVersion(server)
  const [authorizedKeys] = await Promise.all([
    authorizedKeysForServer(prisma, server.id),
    prisma.server.update({
      where: { id: server.id },
      data: {
        entitlementValidUntil: entitlement.valid_until,
        targetVersion,
      },
    }),
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
  server: Server,
  input: HeartbeatInput
): Promise<void> {
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

  await getPrisma().server.update({
    where: { id: server.id },
    data: {
      lastHeartbeatAt: now,
      agentVersion: input.agent_version ?? server.agentVersion,
      metrics: toStoredMetrics(appendSample(server.metrics, sample, now)),
    },
  })
}

export function metricsOf(server: Server): MetricSample[] {
  return readSamples(server.metrics)
}
