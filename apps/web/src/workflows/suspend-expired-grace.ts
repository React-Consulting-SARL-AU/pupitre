import type { WorkflowStep } from "cloudflare:workers"
import { suspendExpiredGrace } from "@pupitre/api/billing/grace"

export const SUSPEND_EXPIRED_GRACE_STEP = "suspend-expired-grace"

export function runSuspendExpiredGrace(step: WorkflowStep): Promise<string[]> {
  return step.do(SUSPEND_EXPIRED_GRACE_STEP, () => suspendExpiredGrace())
}
