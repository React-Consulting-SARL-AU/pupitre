import type { WorkflowStep } from "cloudflare:workers"
import { decommissionDueServers } from "@pupitre/api/servers/expire"

export const DECOMMISSION_SERVER_STEP = "decommission-due-servers"

export function runDecommissionServer(step: WorkflowStep): Promise<string[]> {
  return step.do(DECOMMISSION_SERVER_STEP, () => decommissionDueServers())
}
