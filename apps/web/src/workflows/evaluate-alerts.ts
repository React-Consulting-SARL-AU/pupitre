import type { WorkflowStep } from "cloudflare:workers"
import { type AlertRun, evaluateAlerts } from "@pupitre/api/alerts/evaluate"

export const EVALUATE_ALERTS_STEP = "evaluate-alerts"

export function runEvaluateAlerts(step: WorkflowStep): Promise<AlertRun[]> {
  return step.do(EVALUATE_ALERTS_STEP, () => evaluateAlerts())
}
