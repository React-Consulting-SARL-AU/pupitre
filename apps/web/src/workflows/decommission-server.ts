import type { WorkflowStep } from "cloudflare:workers"
import {
  DECOMMISSION_BATCH_SIZE,
  decommissionDueServersBatch,
} from "@pupitre/api/servers/expire"
import { drainInSteps } from "./steps"

export const DECOMMISSION_SERVER_STEP = "decommission-due-servers"

export function runDecommissionServer(step: WorkflowStep): Promise<string[]> {
  return drainInSteps(
    step,
    DECOMMISSION_SERVER_STEP,
    DECOMMISSION_BATCH_SIZE,
    () => decommissionDueServersBatch()
  )
}
