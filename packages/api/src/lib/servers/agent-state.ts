import type { Server } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import {
  type EntitlementState,
  entitlementForServer,
} from "../billing/entitlement"
import { resolveTargetVersion } from "../releases/releases"
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
  hostname: string
  module_params: Record<string, unknown>
}

export interface HeartbeatInput {
  disk: number
  ram: number
  load: number
  sessions: string[]
  stack_version: string
  modules: string[]
  agent_version?: string
}

export async function readAgentState(server: Server): Promise<AgentState> {
  const prisma = getPrisma()
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
    hostname: server.host ?? server.name,
    module_params: {},
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
