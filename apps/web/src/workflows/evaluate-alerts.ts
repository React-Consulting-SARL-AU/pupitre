import type { WorkflowStep } from "cloudflare:workers"
import {
  ALERT_NOTICE_BATCH_SIZE,
  type AlertRun,
  evaluateAlertsBatch,
  notifyAlerts,
} from "@pupitre/api/alerts/evaluate"
import { sliceInSteps, walkInSteps } from "./steps"

export const EVALUATE_ALERTS_STEP = "evaluate-alerts"

export const NOTIFY_ALERTS_STEP = "notify-alerts"

// Emails leave in steps of their own, so a failed send never replays an evaluation.
export async function runEvaluateAlerts(
  step: WorkflowStep
): Promise<AlertRun[]> {
  const batches = await walkInSteps(step, EVALUATE_ALERTS_STEP, (after) =>
    evaluateAlertsBatch(after)
  )

  await sliceInSteps(
    step,
    NOTIFY_ALERTS_STEP,
    batches.flatMap((batch) => batch.pending),
    ALERT_NOTICE_BATCH_SIZE,
    (slice) => notifyAlerts(slice)
  )

  return batches.flatMap((batch) => batch.runs)
}
