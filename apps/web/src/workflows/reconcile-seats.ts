import type { WorkflowStep } from "cloudflare:workers"
import {
  reconcileSeatsBatch,
  type SeatReconciliation,
} from "@pupitre/api/billing/reconcile"
import { walkInSteps } from "./steps"

export const RECONCILE_SEATS_STEP = "reconcile-seats"

// Reports only drifted subscriptions: the rest would only weigh on the run's output.
export async function runReconcileSeats(
  step: WorkflowStep
): Promise<SeatReconciliation[]> {
  const batches = await walkInSteps(step, RECONCILE_SEATS_STEP, (after) =>
    reconcileSeatsBatch(after)
  )

  return batches
    .flatMap((batch) => batch.report)
    .filter((reconciliation) => reconciliation.drift !== 0)
}
