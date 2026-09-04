import type { WorkflowStep } from "cloudflare:workers"
import {
  reconcileSeats,
  type SeatReconciliation,
} from "@pupitre/api/billing/reconcile"

export const RECONCILE_SEATS_STEP = "reconcile-seats"

export function runReconcileSeats(
  step: WorkflowStep
): Promise<SeatReconciliation[]> {
  return step.do(RECONCILE_SEATS_STEP, () => reconcileSeats())
}
